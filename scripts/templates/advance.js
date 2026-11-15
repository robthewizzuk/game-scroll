// __TITLE__: a starter Advance (Pocket) game made with `npm run new`. Change anything you like.
// Rich pixel colours. It starts the way a finished game does: a fixed tick (the same physics on every
// phone), Ready (nothing moves until the first tap), Feel for pixel styles (particles, shake, sound and
// a buzz in one call), real 2D physics (crates that tumble), pixel text, a soundtrack in one line and a
// save slot.
import gs from '../gamescroll.js';
const { C16 } = gs.palettes;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { mix } = gs.tick;
const { Physics } = gs.physics;
const { text } = gs.pixel;

let W = 192, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true }), ready = new Ready();
  let world, hook, held, score, fallen, t, settle;
  let best = api.load({ tallest: 0 }).tallest;   // this game's save slot: the tallest tower ever
  // Knobs: the numbers that set how it feels (docs/feel-words.md). Sliders in npm run dev (Save to file
  // writes them back); node scripts/knobs.mjs __ID__ lists them. Read K.x where it's used.
  const K = gs.tweak('Feel', {
    gravity: [500, 200, 1000, 'how hard crates fall (lower is floatier)'],
    hook: [40, 15, 90, 'how fast the hook swings at the start'],
    faster: [3, 0, 8, 'how much faster it swings for each crate high'],
    bounce: [.1, 0, .6, 'how bouncy crates are'],
    grip: [.8, .1, 1.5, 'how much crates grip each other'],
    lives: [3, 1, 6, 1, 'crates dropped off before the round ends'],
  });

  function setup() {
    world = new Physics({ gravity: K.gravity, scale: 16 });   // Rapier: made in reset(), so the engine has loaded
    world.box(W / 2, H - 8, 70, 16, { fixed: true, tag: 'base' });
    world.onHit((a, b, speed) => { if (speed > 90) feel.hit((a.x + b.x) / 2, Math.max(a.y, b.y) - 6, { power: Math.min(.6, speed / 400), color: C16[1] }); });
  }
  const newCrate = () => { held = { w: 18 + (Math.random() * 3 | 0) * 6, h: 12 + (Math.random() * 2 | 0) * 4, col: C16[2 + (Math.random() * 8 | 0)] }; };
  const towerTop = () => world.things.reduce((m, b) => b.tag === 'crate' && b.sleeping ? Math.min(m, b.y - b.h / 2) : m, H - 16);

  return {
    reset() { setup(); hook = { x: W / 2, was: W / 2, dir: 1 }; score = 0; fallen = 0; t = 0; settle = 0; newCrate(); feel.clear(); ready.reset(); },   // ALL round state here
    resize(w, h) { W = w; H = h; },
    update(dt) {                                  // tick: 60 below, so dt is exactly 1/60 and a tower stands or falls the same on every phone
      feel.update(dt);
      if (feel.frozen) return;                    // hit-stop
      if (!ready.update(dt)) return;              // the hook waits for the first tap
      t += dt;
      world.step(dt);                             // one physics step per tick
      hook.was = hook.x; hook.x += hook.dir * (K.hook + score * K.faster) * dt;   // keep where it was: draw() shows the moment between
      if (hook.x < 20 || hook.x > W - 20) hook.dir *= -1;
      if (!held) { settle -= dt; if (settle <= 0) newCrate(); }
      for (const b of world.things) if (b.tag === 'crate' && b.y > H + 20) {
        world.remove(b); fallen++; feel.hurt();
        if (fallen >= K.lives) { feel.lose(); api.over(); }
      }
      // score: how many crates high the settled tower is
      const height = Math.round((H - 16 - towerTop()) / 12);
      if (height > score) { score = height; api.score(score); feel.powerup(W / 2, towerTop() - 8, { color: C16[4], text: 'HIGHER!' });
        if (score > best) { best = score; api.save({ tallest: best }); } }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3858d8'); g.addColorStop(1, '#88c8f8'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      feel.begin(c);
      // the camera stays put; you could scroll up as the tower grows
      for (const b of world.things) {   // crates can tip over: sx, sy and sangle are where each is between ticks
        c.save(); c.translate(Math.round(b.sx), Math.round(b.sy)); c.rotate(b.sangle);
        const x = -b.w / 2, y = -b.h / 2;
        c.fillStyle = b.tag === 'base' ? C16[12] : b.col; c.fillRect(x, y, b.w, b.h);
        c.fillStyle = '#ffffff55'; c.fillRect(x, y, b.w, 2); c.fillStyle = '#00000044'; c.fillRect(x, y + b.h - 2, b.w, 2);
        c.restore();
      }
      const hx = Math.round(mix(hook.was, hook.x));
      c.fillStyle = C16[13]; c.fillRect(0, 10, W, 2); c.fillRect(hx - 1, 12, 2, 8);
      if (held) { c.fillStyle = held.col; c.fillRect(Math.round(hx - held.w / 2), 20, held.w, held.h); }
      feel.end(c, W, H);
      // The app draws the score top centre (api.scoreArea() says where): this HUD sits in the corners.
      text(c, `BEST ${best}`, 4, 2, { color: C16[1] });                       // crisp pixel text
      text(c, 'X'.repeat(fallen), W - 4, 2, { color: C16[2], align: 'right' });
      ready.draw(c, W, H, { pixel: true, text: 'TAP TO DROP', color: C16[1], y: H / 2 });
    },
    down() {
      if (ready.go()) return;                     // the first tap only starts the round
      if (!held) return;
      const b = world.box(hook.x, 20 + held.h / 2, held.w, held.h, { tag: 'crate', bounce: K.bounce, friction: K.grip });
      b.col = held.col; b.vx = hook.dir * 20; held = null; settle = .6;
      feel.click();
    },
    key(k, d) { if (d && k === ' ') this.down(); },
    debug(c) { world.debugDraw(c); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Advance · Stacking',
  retro: true, era: 'advance', pal: 'grape',
  w: 192, h: 160, maxH: 240,
  tick: 60,                 // update(1/60) a whole number of times a frame: the same game at 30, 60 and 120 fps
  music: 'puzzle',          // a soundtrack in one line (pixel styles get the chip sound): happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
  goal: 8,
  hint: 'Tap to drop a crate from the moving hook and build the tallest tower you can. Lose three crates and it is over.',
  creator: '__CREATOR__',
  make,
};
