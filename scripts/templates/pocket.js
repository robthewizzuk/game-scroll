// __TITLE__: a starter Dot matrix (Pocket) game made with `npm run new`. Change anything you like.
// Four shades only, crisp pixels. It starts the way a finished game does: a fixed tick (the same game on
// every phone), Ready (nothing moves until the first touch), Feel for pixel styles (particles, shake,
// sound and a buzz in one call), pixel text, a slider stick, a chip tune in one line and knobs: the numbers
// that set how it feels, in one block (docs/feel-words.md).
import gs from '../gamescroll.js';
const { PAL } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { mix } = gs.tick;
const { text } = gs.pixel;
const { Stick, Keys } = gs.controls;

const R = PAL.moss;            // R[0] darkest ... R[3] lightest (the background)
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  const ready = new Ready({ eat: false });        // the first touch starts the round and already steers
  const stick = new Stick({ r: 24, floating: true, axis: 'x', color: R[1] });
  const keys = new Keys();
  // Knobs: change how it feels here. Sliders in npm run dev (Save to file writes them back);
  // node scripts/knobs.mjs __ID__ lists them. Read K.x where it's used.
  const K = gs.tweak('Feel', {
    speed: [110, 40, 220, 'how fast the catcher slides (pixels a second)'],
    spawn: [.9, .4, 2, 'seconds between drops at the start'],
    fastest: [.3, .15, .8, 'seconds between drops when it is hardest'],
    ramp: [36, 10, 120, 'seconds until it is as hard as it gets'],
    fall: [40, 20, 90, 'how fast drops fall at the start'],
    faster: [1.5, 0, 4, 'how much faster drops fall each second'],
    bad: [.25, 0, .6, 'share of drops that are dark'],
    lives: [3, 1, 6, 1, 'dark drops caught before the round ends'],
  });
  let px, pxWas, drops, score, t, spawn, lives;

  return {
    reset() { px = pxWas = W / 2; drops = []; score = 0; t = 0; spawn = 0; lives = K.lives; feel.clear(); ready.reset(); stick.release(); keys.clear(); stick.place(W / 2, H - 20, [0, 0, W, H]); },   // ALL round state here
    resize(w, h) { W = w; H = h; stick.place(W / 2, H - 20, [0, 0, W, H]); },
    update(dt) {                                  // tick: 60 below, so dt is exactly 1/60 on every phone
      feel.update(dt);
      if (feel.frozen) return;                    // hit-stop
      if (!ready.update(dt)) return;              // nothing falls until the first touch
      t += dt; spawn -= dt;
      const dir = stick.active ? stick.x : keys.axis().x;
      pxWas = px; px = Math.max(8, Math.min(W - 8, px + dir * K.speed * dt));
      if (spawn <= 0) { spawn = Math.max(K.fastest, K.spawn - (K.spawn - K.fastest) * t / K.ramp); drops.push({ x: 6 + Math.random() * (W - 12) | 0, y: -6, was: -6, v: K.fall + t * K.faster, bad: Math.random() < K.bad }); }
      for (const d of drops) { d.was = d.y; d.y += d.v * dt; }   // keep where it was: draw() shows the moment between
      for (const d of drops) {
        if (d.y > H - 22 && d.y < H - 12 && Math.abs(d.x - px) < 10) {
          d.y = d.was = H + 99;
          if (d.bad) { lives--; feel.hurt(d.x, H - 18); }
          else { score++; api.score(score); feel.coin(d.x, H - 18, { color: R[1] }); }
        }
      }
      drops = drops.filter(d => d.y < H + 10);
      if (lives <= 0) { feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = R[2]; c.fillRect(0, H - 10, W, 10);
      for (const d of drops) { const y = Math.round(mix(d.was, d.y)); c.fillStyle = d.bad ? R[0] : R[1]; c.fillRect(d.x - 2, y - 2, 5, 5); if (d.bad) { c.fillStyle = R[3]; c.fillRect(d.x, y, 1, 1); } }   // whole pixels, between ticks
      const x = Math.round(mix(pxWas, px));
      c.fillStyle = R[0]; c.fillRect(x - 8, H - 18, 16, 6); c.fillRect(x - 8, H - 22, 2, 4); c.fillRect(x + 6, H - 22, 2, 4);
      feel.end(c, W, H);
      // The app draws the score top centre (api.scoreArea() says where): keep HUDs out of it.
      c.fillStyle = R[0]; for (let i = 0; i < lives; i++) c.fillRect(4 + i * 7, 4, 5, 5);
      ready.draw(c, W, H, { pixel: true, text: 'DRAG TO MOVE', color: R[0], y: H / 2 });   // crisp pixel letters, in a shade of the palette
      if (ready.playing && ready.since < 2) text(c, 'CATCH THE LIGHT ONES', W / 2, 30, { color: R[0], align: 'center' });
    },
    down(x, y, id) { ready.go(); stick.down(x, y, id); },
    move: (x, y, p, id) => stick.move(x, y, p, id),
    up: (x, y, id) => stick.up(x, y, id),
    key(k, d) { if (d) ready.go(); keys.key(k, d); },
    debug(c) { c.strokeStyle = '#f00'; c.strokeRect(px - 10, H - 22, 20, 10); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Pocket · Arcade',
  retro: true, pal: 'moss',
  w: 160, h: 160, maxW: 220, maxH: 240,
  tick: 60,                 // update(1/60) a whole number of times a frame: the same game at 30, 60 and 120 fps
  music: 'happy',           // a soundtrack in one line (pixel styles get the chip sound): happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
  goal: 30,
  hint: 'Drag left and right to catch the light drops. Dodge the dark ones: three and it is over.',
  creator: '__CREATOR__',
  make,
};
