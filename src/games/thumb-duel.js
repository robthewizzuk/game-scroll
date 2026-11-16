// Thumb Duel: a quick-draw for one phone. You take the bottom half; a friend takes the top, or the robot
// does if nobody's there. When the lamp turns GREEN, tap your half first. Tap early on a fake-out
// (yellow, a flicker, a cough) and the point goes the other way. First to five wins the duel.
// The robot is a Tiny Brains rival with a memory: each round it picks the lamp's trick (a plain wait, a
// yellow, a flicker, a cough, two fakes, or a long wait) from how you play it (how quick you are, how
// often you jump the gun, the score). It feels how close each round was: a few milliseconds in it, or
// a fake you fell for, is the exciting one; a mile-wide win is dull. It remembers which trick made a
// close one for this player, and the win-rate rail keeps it fair. Against a friend the lamp is random.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { rnd, clamp } = gs.util;
const { Brain } = gs.brains;
const TRICKS = ['plain', 'yellow', 'flicker', 'cough', 'double', 'long'];

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let score, phase, wait, lamp, fakes, goT, you, them, two, botAt, t, msg, ml, last, rounds, best, ended;
  // how this player duels, kept across rounds: how quick (-1 slow .. 1 sharp) and how often they jump the gun
  const style = { quick: 0, jumpy: -.5 };
  // see: 0 how quick, 1 how jumpy, 2 the score between you, 3 how far into the duel
  const see = () => [style.quick, style.jumpy, (you - them) / 5, clamp(rounds / 8, 0, 1) * 2 - 1];
  const robot = new Brain(api, {
    name: 'thumb-duel-robot', inputs: 4, actions: TRICKS, memory: true,
    // the teacher: a plain lamp to start, a long wait for someone who jumps the gun, else a yellow
    teacher: s => s[3] < -.6 ? 'plain' : s[1] > .1 ? 'long' : 'yellow',
    limits: { react: .1, perSecond: 10, minNoise: .1 },
  });
  const fake = (kind, at) => ({ at, kind, done: false });
  function nextRound() {
    phase = 'wait'; wait = rnd(1.5, 4); lamp = 'red'; goT = 0; botAt = 0;
    fakes = [];
    if (two) { const n = Math.random() * 3 | 0; for (let i = 0; i < n; i++) fakes.push(fake(['yellow', 'flicker', 'cough'][Math.random() * 3 | 0], rnd(.6, wait - .3))); return; }
    robot.act(see(), 1);
    const k = robot.action;
    if (k === 'long') wait = rnd(4, 5.5);
    if (k === 'yellow' || k === 'flicker' || k === 'cough') fakes.push(fake(k, rnd(.5, Math.min(1.4, wait - .3))));
    if (k === 'double') { wait = Math.max(wait, 2.6); fakes.push(fake('yellow', rnd(.4, .9)), fake(Math.random() < .5 ? 'flicker' : 'cough', rnd(1.2, 1.6))); }
  }
  // the round is over: what the robot learns (a close one is the thrill), and how this player duels
  function learn(who, early) {
    if (two) return;
    if (early) { robot.feel(.4); style.jumpy += (1 - style.jumpy) * .25; }
    else {
      style.jumpy += (-1 - style.jumpy) * .1;
      if (who === 'you') { const gap = botAt - goT; robot.feel(gap < .06 ? 1 : gap < .14 ? .3 : -.3); style.quick += (clamp((.4 - goT) / .15, -1, 1) - style.quick) * .25; }
      else robot.feel(.2);
    }
    robot.result(who === 'you');
  }
  function point(who, why) {
    if (who === 'you') you++; else them++;
    msg = why; ml = 1.3; phase = 'gap'; wait = 1.4; rounds++;
    if (who === 'you') { if (!two) { score += 3 + Math.max(0, Math.round((.4 - last) * 10)); api.score(score); } notes('C5 G5', { len: .06 }); haptic('success'); } else { haptic('error'); sfx(150, .2, 'square', .04); }
    if (you >= 5 || them >= 5) {
      phase = 'done'; wait = 2;
      msg = you >= 5 ? (two ? 'BOTTOM WINS!' : 'YOU WIN!') : (two ? 'TOP WINS!' : 'ROBOT WINS');
      if (you >= 5) feel.win(W / 2, H * .75); else feel.lose();
    }
  }

  return {
    reset() { score = 0; you = 0; them = 0; two = false; t = 0; msg = ''; ml = 0; last = 0; rounds = 0; best = 9; ended = false; nextRound(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      if (phase === 'done') { wait -= dt; if (wait <= 0 && !ended) { ended = true; api.over(); } return; }
      if (phase === 'gap') { wait -= dt; if (wait <= 0) nextRound(); return; }
      if (phase === 'wait') {
        wait -= dt;
        for (const f of fakes) if (!f.done && wait <= (f.at)) { f.done = true; if (f.kind === 'yellow') { lamp = 'yellow'; sfx(400, .1, 'triangle', .03); } else if (f.kind === 'flicker') { lamp = 'flicker'; } else { sfx(200, .08, 'sawtooth', .04, -50); } }
        if (lamp !== 'red' && Math.random() < dt * 3) lamp = 'red';
        if (wait <= 0) { phase = 'go'; lamp = 'green'; goT = 0; sfx(880, .15, 'square', .05); haptic('heavy'); botAt = rnd(.26, .5) - Math.min(.08, rounds * .005) + (1 - robot.skill) * .06; }
        return;
      }
      if (phase === 'go') { goT += dt; if (!two && goT >= botAt) { last = goT; learn('them', false); point('them', `ROBOT ${Math.round(goT * 1000)} ms`); } }
    },
    draw(c) {
      c.fillStyle = '#14213d'; c.fillRect(0, 0, W, H / 2); c.fillStyle = '#1b263b'; c.fillRect(0, H / 2, W, H / 2);
      c.fillStyle = '#ffffff20'; c.fillRect(0, H / 2 - 1, W, 2);
      // scores, the top one upside down for the friend across the table
      const pips = (n, y, col) => { for (let i = 0; i < 5; i++) { c.fillStyle = i < n ? col : '#ffffff20'; c.beginPath(); c.arc(W / 2 - 60 + i * 30, y, 9, 0, 7); c.fill(); } };
      pips(them, 90, '#fca311'); pips(you, H - 90, '#4cc9f0');
      c.save(); c.translate(W / 2, 140); c.rotate(Math.PI); c.fillStyle = '#ffffff90'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(two ? 'PLAYER 2 · tap here' : 'ROBOT (tap here to play a friend)', 0, 0); c.restore();
      c.fillStyle = '#ffffff90'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('YOU · tap here on GREEN', W / 2, H - 130);
      feel.begin(c);
      // the lamp in the middle
      const col = lamp === 'green' ? '#38b000' : lamp === 'yellow' ? '#ffd60a' : lamp === 'flicker' && Math.floor(t * 30) % 2 ? '#70e000' : '#d00000';
      c.fillStyle = '#0d1b2a'; c.beginPath(); c.arc(W / 2, H / 2, 64, 0, 7); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(W / 2, H / 2, 52, 0, 7); c.fill();
      c.fillStyle = '#ffffff40'; c.beginPath(); c.arc(W / 2 - 16, H / 2 - 18, 14, 0, 7); c.fill();
      feel.end(c, W, H);
      c.textAlign = 'center';
      if (ml > 0) { c.fillStyle = '#fff'; c.font = '800 22px Rubik, sans-serif'; c.fillText(msg, W / 2, H / 2 + 100); }
      else if (phase === 'wait') { c.fillStyle = '#ffffff70'; c.font = '600 14px Rubik, sans-serif'; c.fillText('wait for green...', W / 2, H / 2 + 100); }
    },
    down(x, y) {
      const top = y < H / 2;
      if (top && !two && phase !== 'go') { two = true; msg = 'Two players!'; ml = 1; return; }
      if (phase === 'wait') { if (!top) learn('them', true); return point(top ? 'you' : 'them', top ? 'TOP TAPPED EARLY' : 'TOO EARLY!'); }
      if (phase !== 'go') return;
      last = goT;
      if (top) { if (two) point('them', `TOP ${Math.round(goT * 1000)} ms`); }
      else { best = Math.min(best, goT); learn('you', false); point('you', `${Math.round(goT * 1000)} ms!`); feel.coin(x, y); }
    },
    key(k, d) { if (d && (k === ' ' || k === 'Enter')) this.down(W / 2, H * .8); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'thumb-duel',
  title: 'Thumb Duel',
  tag: 'Casual · Party',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 15,
  hint: 'Against the robot: tap your half the moment the lamp turns green, before the robot or a friend on the top half. Tapping on a fake-out gives them the point. First to five.',
  make,
};
