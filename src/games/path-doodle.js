// Path Doodle: a ball rolls on and on, and the only ground is the ink you draw under it.
// Draw ramps, bridges and loops ahead of it; ink fades after a few seconds and the pot runs dry,
// so roll it through ink drops to refill. Stars are worth a bonus. Drop into the lava and it's over.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { Physics } = gs.physics;
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx } = gs.sound;
const { clamp } = gs.util;

let W = 160, H = 176;
const INK = 100, FADE = 4.5, R = 5;

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const feel = new Feel({ pixel: true });
  let phys, ball, segs, cam, ink, score, dist, stars, drops, rocks, last, t, dead, nextX, starsGot, msg;

  function spawnAhead() {
    while (nextX < cam + W * 2) {
      const x = nextX, k = Math.random();
      if (k < .35) { const h = 30 + Math.random() * 60; rocks.push({ x, h, thing: phys.box(x, H - h / 2, 18, h, { fixed: true, tag: 'rock' }) }); }
      if (Math.random() < .7) stars.push({ x: x + 30 + Math.random() * 30, y: 30 + Math.random() * (H - 90), got: false });
      if (Math.random() < .45) drops.push({ x: x + 50 + Math.random() * 30, y: 30 + Math.random() * (H - 80), got: false });
      nextX += 70 + Math.random() * 50;
    }
  }

  function inkAt(x, y) {   // draw: x, y are screen units
    const wx = x + cam;
    if (!last) { last = [wx, y]; return; }
    const d = Math.hypot(wx - last[0], y - last[1]);
    if (d < 5) return;
    const cost = d * .28;
    if (ink < cost) { if (ink > 0) haptic('warning'); ink = 0; last = [wx, y]; return; }
    ink -= cost;
    const thing = phys.line([[last[0], last[1]], [wx, y]], { friction: .2 });
    segs.push({ a: last, b: [wx, y], age: 0, thing });
    if (segs.length % 3 === 0) sfx(900 + Math.random() * 300, .02, 'triangle', .015);
    last = [wx, y];
  }

  return {
    reset() {
      phys?.free?.();
      phys = new Physics({ gravity: 420, scale: 20 });
      cam = 0; ink = INK; score = 0; dist = 0; starsGot = 0; t = 0; dead = 0; last = null; nextX = W + 40;
      segs = []; stars = []; drops = []; rocks = [];
      // a little starting ledge
      const ledge = phys.line([[0, 60], [70, 74]], { friction: .2 });
      segs.push({ a: [0, 60], b: [70, 74], age: -3, thing: ledge });
      ball = phys.circle(14, 48, R, { bounce: .15, friction: .4, density: 1, tag: 'ball' });
      msg = 1; ready.reset(); spawnAhead(); feel.clear();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      if (!ready.playing) return;
      t += dt; if (msg > 0) msg -= dt;
      if (dead) { dead += dt; if (dead > .9) api.over(); return; }
      if (ball.vx < 55) ball.force(8, 0);            // it always wants to roll on
      phys.step(dt);
      // camera keeps the ball a third of the way across
      cam = Math.max(cam, ball.x - W * .33);
      if (ball.x - 14 > dist) { dist = ball.x - 14; }
      // fading ink
      for (const s of segs) { s.age += dt; if (s.age > FADE || s.b[0] < cam - 20) { s.thing.remove(); s.gone = true; } }
      segs = segs.filter(s => !s.gone);
      for (const s of stars) if (!s.got && Math.hypot(s.x - ball.x, s.y - ball.y) < R + 6) { s.got = true; starsGot++; feel.coin(Math.round(s.x - cam), Math.round(s.y)); }
      for (const d of drops) if (!d.got && Math.hypot(d.x - ball.x, d.y - ball.y) < R + 6) { d.got = true; ink = Math.min(INK, ink + 35); feel.powerup(Math.round(d.x - cam), Math.round(d.y)); }
      stars = stars.filter(s => s.x > cam - 20); drops = drops.filter(d => d.x > cam - 20);
      for (const r of rocks) if (r.x < cam - 40 && !r.gone) { r.thing.remove(); r.gone = true; }
      rocks = rocks.filter(r => !r.gone);
      ink = Math.min(INK, ink + dt * 2);             // a trickle so you're never stuck
      spawnAhead();
      const s = Math.floor(dist / 40) + starsGot * 5;
      if (s !== score) { score = s; api.score(score); }
      if (ball.y > H - 8 || ball.x < cam - 10) { dead = .01; feel.boom(Math.round(ball.x - cam), H - 8); feel.lose(); }
    },
    draw(c) {
      // sky bands and hills that scroll slower
      c.fillStyle = C16[7]; c.fillRect(0, 0, W, H);
      c.fillStyle = C16[1]; for (let i = 0; i < 5; i++) { const x = Math.round(((i * 61 - cam * .2) % (W + 40) + W + 40) % (W + 40) - 20); c.fillRect(x, 14 + (i * 13) % 40, 22, 4); c.fillRect(x + 4, 11 + (i * 13) % 40, 12, 3); }
      c.fillStyle = C16[6]; for (let x = 0; x < W; x += 2) { const h = 26 + Math.sin((x + cam * .4) * .03) * 10; c.fillRect(x, Math.round(H - 14 - h), 2, Math.round(h)); }
      feel.begin(c);
      const ox = -Math.round(cam);
      // lava
      c.fillStyle = C16[2]; c.fillRect(0, H - 10, W, 10); c.fillStyle = C16[3];
      for (let x = 0; x < W; x += 6) c.fillRect(x, H - 10 + Math.round(Math.sin(t * 4 + x) * 1.5), 4, 2);
      // rocks
      for (const r of rocks) { const x = r.x + ox - 9; c.fillStyle = C16[13]; c.fillRect(x, H - r.h, 18, r.h); c.fillStyle = C16[14]; c.fillRect(x, H - r.h, 18, 2); c.fillStyle = C16[12]; for (let y = H - r.h + 6; y < H; y += 8) c.fillRect(x + 3 + (y % 3) * 3, y, 4, 2); }
      // ink lines, pixel dots; fading ones flicker
      for (const s of segs) {
        if (s.age > FADE - 1 && (t * 10 | 0) % 2) continue;
        const n = Math.max(1, Math.ceil(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / 1.5));
        c.fillStyle = s.age < 0 ? C16[12] : C16[0];
        for (let i = 0; i <= n; i++) { const k = i / n; c.fillRect(Math.round(s.a[0] + (s.b[0] - s.a[0]) * k) + ox - 1, Math.round(s.a[1] + (s.b[1] - s.a[1]) * k) - 1, 2, 2); }
      }
      for (const s of stars) if (!s.got) { const x = Math.round(s.x) + ox, y = Math.round(s.y + Math.sin(t * 3 + s.x) * 2); c.fillStyle = C16[4]; c.fillRect(x - 1, y - 4, 3, 9); c.fillRect(x - 4, y - 1, 9, 3); c.fillStyle = C16[1]; c.fillRect(x, y - 1, 1, 1); }
      for (const d of drops) if (!d.got) { const x = Math.round(d.x) + ox, y = Math.round(d.y); c.fillStyle = C16[9]; c.fillRect(x - 3, y - 2, 6, 6); c.fillRect(x - 1, y - 5, 2, 3); c.fillStyle = C16[1]; c.fillRect(x - 2, y - 1, 1, 2); }
      if (!dead) {
        const bx = Math.round(ball.x) + ox, by = Math.round(ball.y);
        c.fillStyle = C16[0]; c.fillRect(bx - 4, by - 5, 8, 10); c.fillRect(bx - 5, by - 4, 10, 8);
        c.fillStyle = C16[10]; c.fillRect(bx - 3, by - 4, 6, 8); c.fillRect(bx - 4, by - 3, 8, 6);
        const a = ball.angle; c.fillStyle = C16[1]; c.fillRect(bx + Math.round(Math.cos(a) * 2) - 1, by + Math.round(Math.sin(a) * 2) - 1, 2, 2);
      }
      feel.end(c, W, H);
      // ink pot HUD
      c.fillStyle = C16[0]; c.fillRect(3, 3, 52, 7); c.fillStyle = ink < 20 && (t * 6 | 0) % 2 ? C16[2] : C16[9]; c.fillRect(4, 4, Math.round(50 * ink / INK), 5);
      text(c, 'INK', 58, 4, { color: C16[0] });
      if (!ready.playing || msg > 0) text(c, 'DRAW GROUND!', W / 2, 90, { font: 'big', align: 'center', color: C16[1], outline: C16[0] });
    },
    down(x, y) { ready.go(); last = null; inkAt(x, y); },
    move(x, y, p) { if (p) inkAt(x, y); },
    up() { last = null; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'path-doodle',
  title: 'Path Doodle',
  tag: 'Color · Drawing',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 240, maxH: 240,
  goal: 40,
  hint: 'Draw ground in front of the rolling ball to keep it out of the lava. Ink fades and runs out, so roll through ink drops.',
  make,
};
