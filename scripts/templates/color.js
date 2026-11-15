// __TITLE__: a starter Color (Pocket) game made with `npm run new`. Change anything you like.
// Bright 16-colour pixels. It starts the way a finished game does: a fixed tick (the same jump on every
// phone), Ready (nothing moves until the first tap), Feel for pixel styles (particles, shake, sound and
// a buzz in one call), pixel text, gestures (tap to jump, hold to jump higher) and a chip tune in one line.
import gs from '../gamescroll.js';
const { C16 } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { mix } = gs.tick;
const { text } = gs.pixel;
const { Gestures } = gs.controls;

let W = 160, H = 176;
const GROUND = () => H - 24;

function make(api) {
  const feel = new Feel({ pixel: true });
  const ready = new Ready({ eat: false });        // the first tap starts the round and is already a jump
  // Knobs: the numbers that set how it feels (docs/feel-words.md). Sliders in npm run dev (Save to file
  // writes them back); node scripts/knobs.mjs __ID__ lists them. Read K.x where it's used.
  const K = gs.tweak('Feel', {
    jump: [150, 90, 260, 'speed of a tap jump (higher jumps higher)'],
    big: [190, 120, 320, 'speed of a held jump'],
    gravity: [520, 250, 1000, 'how hard it falls back (lower is floatier)'],
    speed: [70, 30, 140, 'how fast the rocks come at the start'],
    faster: [2.5, 0, 8, 'how much faster each second'],
    gap: [.8, .3, 2, 'shortest seconds between rocks'],
    tall: [.3, 0, .8, 'share of rocks that are tall'],
  });
  let y, yWas, vy, rocks, score, t, spawn, speed, dead;
  const jump = big => { if (y < GROUND() - .5 || dead) return; vy = big ? -K.big : -K.jump; feel.jump(30, GROUND()); };
  const g = new Gestures({ tap: () => jump(false), hold: () => jump(true) });

  return {
    reset() { y = yWas = GROUND(); vy = 0; rocks = []; score = 0; t = 0; spawn = 1; speed = K.speed; dead = 0; feel.clear(); ready.reset(); g.release(); },   // ALL round state here
    resize(w, h) { W = w; H = h; },
    update(dt) {                                  // tick: 60 below, so dt is exactly 1/60 and the jump is the same height on every phone
      feel.update(dt); g.update();
      if (feel.frozen) return;                    // hit-stop
      if (!ready.update(dt)) return;              // nothing runs until the first tap
      if (dead) { dead += dt; if (dead > .8) api.over(); return; }
      t += dt; speed = K.speed + t * K.faster; spawn -= dt;
      yWas = y; vy += K.gravity * dt; y = Math.min(GROUND(), y + vy * dt);   // keep where it was: draw() shows the moment between
      if (y >= GROUND()) { if (vy > 120) feel.land(30, GROUND(), vy); vy = 0; }
      if (spawn <= 0) { spawn = K.gap + Math.random() * 1.1; rocks.push({ x: W + 8, was: W + 8, h: Math.random() < K.tall ? 14 : 8, passed: false }); }
      for (const r of rocks) {
        r.was = r.x; r.x -= speed * dt;
        if (!r.passed && r.x < 24) { r.passed = true; score++; api.score(score); feel.score(30, y - 16, 1, { color: C16[4] }); }
        if (Math.abs(r.x - 30) < 7 && y > GROUND() - r.h) { dead = .01; feel.boom(30, y - 4, { size: .6, color: [C16[2], C16[3], C16[4]] }); feel.lose(); }
      }
      rocks = rocks.filter(r => r.x > -10);
    },
    draw(c) {
      c.fillStyle = C16[7]; c.fillRect(0, 0, W, H);
      c.fillStyle = C16[1]; for (let i = 0; i < 4; i++) { const x = ((i * 53 - t * 12) % (W + 40) + W + 40) % (W + 40) - 20; c.fillRect(Math.round(x), 20 + i * 11, 18, 5); }
      feel.begin(c);
      c.fillStyle = C16[5]; c.fillRect(0, GROUND(), W, 4); c.fillStyle = C16[11]; c.fillRect(0, GROUND() + 4, W, H);
      for (const r of rocks) { const x = Math.round(mix(r.was, r.x)); c.fillStyle = C16[13]; c.fillRect(x - 5, GROUND() - r.h, 10, r.h); c.fillStyle = C16[14]; c.fillRect(x - 5, GROUND() - r.h, 10, 2); }   // whole pixels, between ticks
      if (!dead) { const yy = Math.round(mix(yWas, y)); c.fillStyle = C16[9]; c.fillRect(24, yy - 12, 12, 12); c.fillStyle = C16[1]; c.fillRect(31, yy - 10, 3, 3); c.fillStyle = C16[0]; c.fillRect(32, yy - 9, 1, 1); }
      feel.end(c, W, H);
      // The app draws the score top centre (api.scoreArea() says where): keep HUDs out of it.
      ready.draw(c, W, H, { pixel: true, text: 'TAP: JUMP', color: C16[0], y: 70 });   // crisp pixel letters
      if (ready.waiting) text(c, 'HOLD: BIG JUMP', W / 2, 80, { color: C16[0], align: 'center' });
    },
    down(x, y, id) { ready.go(); g.down(x, y, id); },
    move: (x, y, p, id) => g.move(x, y, p, id),
    up: (x, y, id) => g.up(x, y, id),
    key(k, d) { if (d && (k === ' ' || k === 'ArrowUp')) { ready.go(); jump(false); } },
    debug(c) { c.strokeStyle = '#f0f'; c.strokeRect(23, y - 12, 14, 12); for (const r of rocks) c.strokeRect(r.x - 5, GROUND() - r.h, 10, r.h); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Color · Runner',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 240,
  tick: 60,                 // update(1/60) a whole number of times a frame: the same game at 30, 60 and 120 fps
  music: 'chase',           // a soundtrack in one line (pixel styles get the chip sound): happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
  goal: 25,
  hint: 'Tap to jump over the rocks. Hold for a big jump over the tall ones.',
  creator: '__CREATOR__',
  make,
};
