// __TITLE__: a starter Classic · Console game made with `npm run new`. Change anything you like.
// Real-time cel-shaded 3D (src/kit/toon3d.js, see docs/console-3d.md) with game logic in plain 2D
// units. It starts the way a finished game does: a fixed tick (the same game on every phone), Ready
// (nothing moves until the first touch), Feel (particles, shake, sound and a buzz in one call) for the
// 2D effects on top, the on-screen joystick and a soundtrack in one line.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { mix } = gs.tick;
const { Stick, Keys } = gs.controls;
const { View, G, part, grp, blob } = gs.toon;

let W = 192, H = 160;

let v3;
function view3d() {
  if (!v3) {
    v3 = new View({ bg: '#5cb84c', sun: [-.6, 1, .4] });
    v3.def('hero', () => grp(part(G.pill, '#3060c0', { sx: 7, sy: 6, sz: 7, y: 6 }), part(G.ball, '#f8c890', { s: 5, y: 13 }), blob(5)));
    v3.def('gem', () => grp(part(G.gem, '#f8d838', { s: 5, y: 6, glow: .5 }), blob(3)));
    v3.def('spike', () => grp(part(G.box, '#a03040', { sx: 9, sy: 9, sz: 9, y: 4.5 }), blob(5)));
    v3.def('tile', () => part(G.box, '#68c858', { y: -.5 }));
  }
  v3.board(W, H, .8);   // tilted top-down: floor point (x, y) lands exactly on screen (x, y)
  return v3;
}

function make(api) {
  const feel = new Feel();
  const ready = new Ready({ eat: false });        // the first touch starts the round and already steers
  const stick = new Stick({ r: 26, floating: true, zone: [0, 0, 9999, 9999] });
  const keys = new Keys();
  let p, gems, spikes, score, t;
  // Knobs: the numbers that set how it feels (docs/feel-words.md). Sliders in npm run dev (Save to file
  // writes them back); node scripts/knobs.mjs __ID__ lists them. Read K.x where it's used.
  const K = gs.tweak('Feel', {
    speed: [80, 30, 160, 'how fast the hero runs (units a second)'],
    every: [3, 1, 8, 1, 'gems picked up between new spikes'],
    spike: [30, 10, 70, 'how fast spikes bounce around'],
    reach: [10, 6, 16, 'how close counts as picking up a gem'],
    hitbox: [11, 6, 16, 'how close a spike has to come to hit'],
  });
  const place = () => ({ x: 16 + Math.random() * (W - 32), y: 16 + Math.random() * (H - 32) });

  return {
    reset() { p = { x: W / 2, y: H / 2, wx: W / 2, wy: H / 2 }; gems = [place(), place(), place()]; spikes = []; score = 0; t = 0; feel.clear(); ready.reset(); stick.release(); keys.clear(); },   // ALL round state here
    resize(w, h) { W = w; H = h; },
    update(dt) {                                  // tick: 60 below, so dt is exactly 1/60 on every phone
      feel.update(dt);
      if (feel.frozen) return;                    // hit-stop
      if (!ready.update(dt)) return;              // nothing moves until the first touch
      t += dt;
      const a = stick.active ? stick : keys.axis();
      p.wx = p.x; p.wy = p.y;                     // keep where it was: draw() shows the moment between
      p.x = Math.max(8, Math.min(W - 8, p.x + a.x * K.speed * dt)); p.y = Math.max(8, Math.min(H - 8, p.y + a.y * K.speed * dt));
      for (const g of gems) if (Math.hypot(g.x - p.x, g.y - p.y) < K.reach) {
        score++; api.score(score);
        feel.coin(g.x, g.y - 6, { color: '#f8d838', pitch: 1 + score * .02 });
        Object.assign(g, place());
        if (score % K.every === 0) { const s = place(); spikes.push({ ...s, wx: s.x, wy: s.y, vx: (Math.random() < .5 ? -1 : 1) * K.spike, vy: (Math.random() < .5 ? -1 : 1) * K.spike * .8 }); }
      }
      for (const s of spikes) {
        s.wx = s.x; s.wy = s.y; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < 8 || s.x > W - 8) s.vx *= -1; if (s.y < 8 || s.y > H - 8) s.vy *= -1;
        if (Math.hypot(s.x - p.x, s.y - p.y) < K.hitbox) { feel.boom(p.x, p.y - 6, { size: .7 }); feel.lose(); api.over(); }
      }
    },
    draw(c) {
      const v = view3d(); v.frame();
      for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) if ((x + y) % 32 === 0) v.put('tile', v.at(x + 8, y + 8), { sx: 16, sy: 1, sz: 16 / v.sin });
      for (const g of gems) v.put('gem', v.at(g.x, g.y, Math.sin(t * 4 + g.x) * 2), { ry: t * 2 });
      for (const s of spikes) v.put('spike', v.at(mix(s.wx, s.x), mix(s.wy, s.y)), { ry: t * 3 });   // smooth on 90 and 120 Hz screens
      v.put('hero', v.at(mix(p.wx, p.x), mix(p.wy, p.y)), { ry: stick.active ? -stick.angle - Math.PI / 2 : 0 });
      feel.begin(c); v.render(c, W, H); feel.end(c, W, H);   // 3D frame, then 2D effects and HUD on top
      stick.draw(c);
      // The app draws the score top centre (api.scoreArea() says where): keep HUDs out of it.
      ready.draw(c, W, H, { text: 'Drag anywhere to move', size: 11, y: H - 14 });
    },
    down(x, y, id) { ready.go(); stick.down(x, y, id); },
    move: (x, y, pr, id) => stick.move(x, y, pr, id),
    up: (x, y, id) => stick.up(x, y, id),
    key(k, d) { if (d) ready.go(); keys.key(k, d); },
    debug(c) { c.strokeStyle = '#0f8'; c.beginPath(); c.arc(p.x, p.y, 10, 0, 7); c.stroke(); for (const s of spikes) { c.beginPath(); c.arc(s.x, s.y, 11, 0, 7); c.stroke(); } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Console · Arcade',
  retro: true, era: 'console', pal: 'grape',
  w: 192, h: 160, maxW: 300, maxH: 240,
  tick: 60,                 // update(1/60) a whole number of times a frame: the same game at 30, 60 and 120 fps
  music: 'happy',           // a soundtrack in one line: happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
  goal: 20,
  hint: 'Drag to run around and grab the gems. Every third gem adds a bouncing spike block, so do not touch one.',
  creator: '__CREATOR__',
  make,
};
