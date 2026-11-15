// __TITLE__: a starter Phone (Casual) game made with `npm run new`. Change anything you like.
// It starts the way a finished game does: a fixed tick (the same game on every phone), Ready (nothing
// moves until the first tap), Feel (particles, shake, sound and a buzz in one call), a soundtrack in
// one line, a save slot and knobs: the numbers that set how it feels, in one block (docs/feel-words.md).
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { mix } = gs.tick;
const { ease } = gs.juice;
const { tweak } = gs;

let W = 360, H = 640;

function make(api) {
  const feel = new Feel(), ready = new Ready();
  // Knobs: change how it feels here. Sliders in npm run dev (Save to file writes them back);
  // node scripts/knobs.mjs __ID__ lists them. Read K.x where it's used.
  const K = tweak('Feel', {
    spawn: [1.1, .4, 2.5, 'seconds between orbs at the start'],
    fastest: [.35, .15, 1, 'seconds between orbs when it is hardest'],
    ramp: [30, 10, 120, 'seconds until it is as hard as it gets'],
    life: [2.4, 1, 5, 'seconds an orb waits before it fades'],
    lives: [3, 1, 6, 1, 'missed orbs before the round ends'],
    size: [28, 16, 44, 'orb radius'],
    gold: [.12, 0, .5, 'share of orbs that are gold'],
  });
  let orbs, score, t, lives, combo, spawn;
  // The save slot is this game's own: here it keeps a running total of orbs popped, ever.
  let total = api.load({ popped: 0 }).popped;

  return {
    reset() { orbs = []; score = 0; t = 0; lives = K.lives; combo = 0; spawn = 0; feel.clear(); ready.reset(); },   // ALL round state here
    resize(w, h) { W = w; H = h; },
    update(dt) {                                  // tick: 60 below, so dt is exactly 1/60 on every phone
      feel.update(dt);
      if (feel.frozen) return;                    // hit-stop: the action holds for a moment on a big hit
      if (!ready.update(dt)) return;              // nothing moves or scores until the first tap
      t += dt; spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(K.fastest, K.spawn - (K.spawn - K.fastest) * t / K.ramp);
        const o = { x: 40 + Math.random() * (W - 80), y: 140 + Math.random() * (H - 260), was: 0, r: 0, life: K.life, gold: Math.random() < K.gold };
        o.was = o.y;
        feel.juice.tween(o, { r: o.gold ? K.size * .8 : K.size }, .35, ease.outBack);   // orbs pop in with a little overshoot
        orbs.push(o);
      }
      for (const o of orbs) { o.was = o.y; o.y -= 14 * dt; o.life -= dt; }   // keep where it was: draw() shows the moment between
      const missed = orbs.filter(o => o.life <= 0);
      if (missed.length) {
        orbs = orbs.filter(o => o.life > 0);
        lives -= missed.length; combo = 0;
        feel.hurt();                              // shake, red flash, sound and a buzz
        if (lives <= 0) { api.save({ popped: total }); feel.lose(); api.over(); }
      }
    },
    draw(c) {                                     // draw(c, alpha) if you want it; mix() reads it for you
      c.fillStyle = '#141a2b'; c.fillRect(0, 0, W, H);
      feel.begin(c);                              // everything between begin and end shakes
      for (const o of orbs) {
        const y = mix(o.was, o.y), warn = o.life < .7 && (o.life * 10 | 0) % 2;   // smooth on 90 and 120 Hz screens
        c.fillStyle = o.gold ? '#ffd23f' : warn ? '#ff6b81' : '#4fc3ff';
        c.beginPath(); c.arc(o.x, y, o.r, 0, 7); c.fill();
        c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(o.x - o.r * .3, y - o.r * .3, o.r * .3, 0, 7); c.fill();
      }
      feel.end(c, W, H);                          // particles, pop-up text, flash
      ready.draw(c, W, H);                        // a pulsing "Tap to start" until the first tap
      // The app draws the score top centre (api.scoreArea() says where): this HUD stays at the bottom.
      c.fillStyle = '#ffffffcc'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'left';
      c.fillText('♥'.repeat(Math.max(0, lives)), 16, H - 24);
      c.textAlign = 'right'; c.font = '500 13px Rubik, sans-serif'; c.fillText(`${total} popped ever`, W - 16, H - 24);
    },
    down(x, y) {
      if (ready.go()) return;                     // the first tap only starts the round
      const i = orbs.findIndex(o => Math.hypot(o.x - x, o.y - y) < o.r + 12);
      if (i < 0) { combo = 0; return; }
      const o = orbs.splice(i, 1)[0], pts = (o.gold ? 5 : 1) * (1 + Math.min(4, combo >> 2));
      combo++; total++; score += pts; api.score(score);
      if (o.gold) feel.boom(o.x, o.y, { size: .5, color: ['#ffd23f', '#fff4a0', '#ffffff'] });
      feel.coin(o.x, o.y, { color: o.gold ? '#ffd23f' : '#4fc3ff', text: '+' + pts, pitch: 1 + Math.min(combo, 12) * .04 });
      if (total % 10 === 0) api.save({ popped: total });   // save now and then, not every tap
    },
    key(k, isDown) { if (isDown && k === ' ') ready.go(); },
    // Debug overlay (press ` in npm run dev, then H): outline the tap areas.
    debug(c) { c.strokeStyle = '#0f8'; for (const o of orbs) { c.beginPath(); c.arc(o.x, o.y, o.r + 12, 0, 7); c.stroke(); } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Casual · Reflex',
  retro: false,
  w: 360, h: 640, maxH: 800,
  tick: 60,                 // update(1/60) a whole number of times a frame: the same game at 30, 60 and 120 fps
  music: 'happy',           // a soundtrack in one line: happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
  goal: 40,
  hint: 'Tap the orbs before they fade. Gold ones are worth more. Miss three and it is over.',
  creator: '__CREATOR__',
  make,
};
