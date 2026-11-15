// Ping Pong Rally: table tennis from above. Drag left and right to move your bat; the ball bounces on
// your side and you return it just by being there. Where it meets the bat aims it, and moving the bat as
// you hit adds slice. Aim near the edges to beat the robot, but hit it off the table and you lose a ball.
// The robot is a Tiny Brains rival with a memory: for each return it picks right at your bat, a step
// away, a long way away, the far edge, or a quick one. It feels each of your returns (a stretch at the
// end of the bat is the exciting one, standing still for it is dull) and remembers which return made a
// close call for this player from where; the win-rate rail keeps the rally fair. Its eyes glow gold
// when it plays one it remembered.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp, rnd } = gs.util;
const { Brain } = gs.brains;
const { Ready } = gs.rounds;
const { icon } = gs.icons;
const RETURNS = ['at', 'near', 'far', 'edge', 'quick'];

let W = 360, H = 640;

function make(api) {
  const feel = new Feel(), ready = new Ready({ eat: false });
  let bat, bot, ball, score, balls, rally, t, vxBat, lastX, msg, ml, wait, glow = 0, usual = 0;
  // see: 0 where your bat is, 1 how fast it's moving, 2 where you usually wait, 3 where the robot hits from, 4 how long the rally is
  const see = x => [clamp((bat.x - W / 2) / (W / 2 - 44), -1, 1), clamp(vxBat / 400, -1, 1), usual, clamp((x - W / 2) / (W / 2 - 44), -1, 1), clamp(rally / 12, 0, 1) * 2 - 1];
  const robot = new Brain(api, {
    name: 'ping-pong-robot', inputs: 5, actions: RETURNS, memory: true,
    // the teacher: easy ones while a rally starts, then a step or a long way from your bat
    teacher: s => s[4] < -.6 ? 'near' : Math.abs(s[0]) > .5 ? 'far' : 'near',
    limits: { react: .1, perSecond: 10, minNoise: .08 },
  });
  const T = () => ({ l: 44, r: W - 44, top: 110, bot: H - 150 });
  const youY = () => T().bot + 26, botY = () => T().top - 26;

  function shot(from, toward, quick = 1) {
    // a shot from (x0, y0) to (x1, y1), bouncing once on the far half
    const sp = Math.max(.55, 1.15 - rally * .03) * quick;
    ball = { x0: from.x, y0: from.y, x1: toward.x, y1: toward.y, k: 0, dur: sp, by: .62, toYou: toward.y > from.y };
    sfx(toward.y > from.y ? 700 : 900, .03, 'square', .04);
  }
  // the robot's return: it picks where from your bat to put it
  function reply(x) {
    const tb = T(); robot.act(see(x), 1);
    const kind = robot.action, side = Math.random() < .5 ? -1 : 1;
    glow = robot.remembered ? 1.2 : 0;
    let tx = kind === 'at' ? bat.x + rnd(-14, 14) : kind === 'near' || kind === 'quick' ? bat.x + side * rnd(40, 75) : kind === 'far' ? bat.x + side * rnd(95, 150) : (bat.x > W / 2 ? tb.l + rnd(10, 26) : tb.r - rnd(10, 26));
    if (tx < tb.l + 12 || tx > tb.r - 12) tx = bat.x - (tx - bat.x);     // off the side: the other way from the bat
    shot({ x, y: botY() }, { x: clamp(tx, tb.l + 12, tb.r - 12), y: youY() }, kind === 'quick' ? .82 : 1);
  }
  function serve() {
    rally = 0; wait = .8;
    const tb = T(); bot.x = W / 2;
    shot({ x: W / 2, y: botY() }, { x: rnd(tb.l + 30, tb.r - 30), y: youY() });
  }
  const bx = () => ball.x0 + (ball.x1 - ball.x0) * ball.k, by = () => ball.y0 + (ball.y1 - ball.y0) * ball.k;
  const bz = () => { const k = ball.k, b = ball.by; return k < b ? Math.sin(k / b * Math.PI) * 40 : Math.sin((k - b) / (1 - b) * Math.PI) * 22; };

  return {
    reset() { ready.reset(); bat = { x: W / 2 }; bot = { x: W / 2 }; score = 0; balls = 3; t = 0; vxBat = 0; lastX = null; msg = ''; ml = 0; glow = 0; serve(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      vxBat *= Math.pow(.02, dt); glow = Math.max(0, glow - dt);
      if (!ready.update(dt)) return;
      if (wait > 0) { wait -= dt; return; }
      const tb = T();
      ball.k += dt / ball.dur;
      // the robot runs toward where the ball will arrive, with a top speed (quicker as it learns your game)
      const top = (160 + Math.min(120, rally * 6)) * (.8 + .4 * robot.skill), to = ball.toYou ? W / 2 : ball.x1;
      bot.x += clamp(to - bot.x, -(ball.toYou ? 80 : top) * dt, (ball.toYou ? 80 : top) * dt);
      if (ball.k >= ball.by && !ball.bounced) { ball.bounced = true; sfx(1100, .02, 'square', .03); }
      if (ball.k < 1) return;
      const x = ball.x1;
      if (ball.toYou) {
        const off = (x - bat.x) / 34, reach = Math.abs(off);
        usual += (clamp((bat.x - W / 2) / (W / 2 - 44), -1, 1) - usual) * .1;
        // what the robot learns from this return: a stretch to the end of the bat is the close call
        robot.feel(reach <= 1.15 ? (reach > .7 ? 1 : reach < .35 ? -.2 : .3) : reach < 1.9 ? .6 : -.4);
        if (reach <= 1.15) {
          rally++;
          const tx = x + off * 70 + vxBat * .25;
          shot({ x, y: youY() }, { x: tx, y: botY() });
          haptic('light'); feel.hit(x, youY() - 8, { power: .5 });
          if (tx < tb.l || tx > tb.r) { ball.out = true; }
        } else { lose('MISSED'); }
      } else {
        if (ball.out) return lose('OUT!');
        if (Math.abs(x - bot.x) <= 36) {
          score++; api.score(score);
          reply(x);
        } else {
          robot.result(true);
          score += 3; api.score(score); msg = 'WINNER! +3'; ml = 1; notes('C5 E5 G5', { len: .06 }); feel.coin(x, botY()); haptic('success');
          serve();
        }
      }
    },
    draw(c) {
      c.fillStyle = '#264653'; c.fillRect(0, 0, W, H);
      const tb = T();
      c.fillStyle = '#1b3a46'; c.fillRect(tb.l - 6, tb.top - 6, tb.r - tb.l + 12, tb.bot - tb.top + 12);
      c.fillStyle = '#2a9d8f'; c.fillRect(tb.l, tb.top, tb.r - tb.l, tb.bot - tb.top);
      c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.strokeRect(tb.l, tb.top, tb.r - tb.l, tb.bot - tb.top);
      c.lineWidth = 1; c.beginPath(); c.moveTo(W / 2, tb.top); c.lineTo(W / 2, tb.bot); c.stroke();
      const ny = (tb.top + tb.bot) / 2; c.fillStyle = '#e9ecef'; c.fillRect(tb.l - 14, ny - 3, tb.r - tb.l + 28, 6); c.fillStyle = '#00000030'; c.fillRect(tb.l - 14, ny + 3, tb.r - tb.l + 28, 4);
      feel.begin(c);
      // robot bat
      c.fillStyle = '#e76f51'; c.beginPath(); c.roundRect(bot.x - 34, botY() - 8, 68, 14, 7); c.fill();
      c.fillStyle = '#6c757d'; c.fillRect(bot.x - 3, botY() - 26, 6, 18);
      // the robot's eyes: gold while it plays a return it remembered working on you
      c.fillStyle = glow > 0 ? '#ffd166' : '#adb5bd'; c.fillRect(bot.x - 9, botY() - 36, 6, 5); c.fillRect(bot.x + 3, botY() - 36, 6, 5);
      // the ball and its shadow
      if (ball) {
        const x = bx(), y = by(), z = bz();
        c.fillStyle = '#00000040'; c.beginPath(); c.ellipse(x + z * .3, y + z * .2, 6, 4, 0, 0, 7); c.fill();
        c.fillStyle = '#fff3b0'; c.beginPath(); c.arc(x, y - z, 6 + z * .05, 0, 7); c.fill();
      }
      // your bat
      c.fillStyle = '#e63946'; c.beginPath(); c.roundRect(bat.x - 34, youY() - 6, 68, 14, 7); c.fill();
      c.fillStyle = '#ffffff40'; c.fillRect(bat.x - 26, youY() - 3, 52, 3);
      c.fillStyle = '#8d6e63'; c.fillRect(bat.x - 4, youY() + 8, 8, 22);
      feel.end(c, W, H);
      for (let i = 0; i < balls; i++) icon(c, 'tennis-racket', 26 + i * 24, H - 30, 20, { color: '#e63946' });
      c.fillStyle = '#fff';
      c.textAlign = 'right'; c.font = '600 14px Rubik, sans-serif'; c.fillText(`rally ${rally}`, W - 16, H - 24);
      c.textAlign = 'center';
      if (ml > 0) { c.font = '800 26px Rubik, sans-serif'; c.fillStyle = '#ffd166'; c.fillText(msg, W / 2, H * .45); }
      if (ready.waiting || t < 4) { c.font = '600 15px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText('Drag to move your bat', W / 2, H - 60); }
    },
    down(x) { ready.go(); lastX = x; },
    move(x, y, pr) { if (pr) ready.go(); if (lastX == null) lastX = x; const dx = x - lastX; vxBat = vxBat * .5 + dx * 30; bat.x = clamp(x, 34, W - 34); lastX = x; },
    up() { lastX = null; },
    key(k, d) { if (d) ready.go(); if (d && k === 'ArrowLeft') { bat.x = clamp(bat.x - 30, 34, W - 34); vxBat = -400; } if (d && k === 'ArrowRight') { bat.x = clamp(bat.x + 30, 34, W - 34); vxBat = 400; } },
  };

  function lose(why) {
    robot.result(false); balls--; msg = why; ml = 1.2; feel.hurt(W / 2, H / 2); haptic('error'); sfx(150, .25, 'square', .04);
    if (balls <= 0) { feel.lose(); api.over(); return; }
    serve();
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'ping-pong-rally',
  title: 'Ping Pong Rally',
  tag: 'Casual · Sport',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'Drag to move your bat into the ball. Where it hits the bat aims your return; beat the robot near the edges, but keep it on the table. Lose three balls and it is over.',
  make,
};
