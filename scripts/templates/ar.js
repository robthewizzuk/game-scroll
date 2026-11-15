// __TITLE__: a starter AR · 3D game made with `npm run new`. Change anything you like.
// 3D in the player's real room (src/kit/ar3d.js, see docs/ar-3d.md): the camera picture behind, the
// gyro to look around, a virtual room and drag-to-look when either is missing. It starts the way a
// finished game does: a fixed tick (the same game on every phone), Ready (nothing floats off until the
// first tap), Feel (particles, shake, sound and a buzz in one call) on the HUD, gestures (tap to pop,
// drag to look) and a soundtrack in one line.
import gs from '../gamescroll.js';
const { want } = gs.device;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { Gestures } = gs.controls;
const { Particles, pbr, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;

let W = 300, H = 460;
const COLS = ['#ff4d6d', '#ffd23f', '#3ddc97', '#4fc3ff', '#b388ff'];

function make(api) {
  want('motion');                     // iPhones ask for motion access on the Play tap
  const feel = new Feel(), ready = new Ready({ text: 'Tap to start' });
  let v, balloons, pops, score, t, spawn, escaped;
  // Knobs: the numbers that set how it feels (docs/feel-words.md). Sliders in npm run dev (Save to file
  // writes them back); node scripts/knobs.mjs __ID__ lists them. Read K.x where it's used.
  const K = gs.tweak('Feel', {
    spawn: [2, .8, 4, 'seconds between balloons at the start'],
    fastest: [.7, .3, 2, 'seconds between balloons when it is hardest'],
    ramp: [39, 10, 120, 'seconds until it is as hard as it gets'],
    rise: [.25, .1, .6, 'how fast balloons float up (metres a second)'],
    lives: [5, 1, 10, 1, 'balloons that get away before the round ends'],
    reach: [34, 20, 60, 'how near a tap has to be to pop one (screen units)'],
  });
  const g = new Gestures({
    tap: (x, y) => tapAt(x, y),
    drag: (x, y, dx, dy) => v?.drag(-dx, -dy),   // no gyro: drag to look around
  });

  function setup() {
    v = new ARView();
    pops = new Particles(v, { max: 300, additive: false });
  }
  function addBalloon() {
    // anywhere round the player, 2-4 m away, so they have to turn to find them
    const a = Math.random() * Math.PI * 2 * (v.sensor ? 1 : .15) - (v.sensor ? Math.PI : .15 * Math.PI), d = 2 + Math.random() * 2;
    const col = COLS[(Math.random() * COLS.length) | 0];
    const m = new THREE.Mesh(new THREE.SphereGeometry(.18, 24, 16), pbr(col, { rough: .25, clear: 1 }));
    m.scale.y = 1.2; m.castShadow = true; m.position.set(-Math.sin(a) * d, FLOOR + .3, -Math.cos(a) * d);
    m.userData = { col, rise: K.rise + Math.random() * .2 + t * .004 };
    v.scene.add(m); balloons.push(m);
  }
  function tapAt(x, y) {
    if (!v) return;
    let best = null, bd = K.reach;
    for (const b of balloons) { const [sx, sy, z] = v.toScreen(b.position.x, b.position.y, b.position.z); const d = Math.hypot(sx - x, sy - y); if (z < 1 && d < bd) { bd = d; best = b; } }
    if (!best) return;
    score++; api.score(score);
    const c = new THREE.Color(best.userData.col);
    for (let i = 0; i < 40; i++) pops.emit({ x: best.position.x, y: best.position.y, z: best.position.z, vx: (Math.random() - .5) * 2.4, vy: Math.random() * 2, vz: (Math.random() - .5) * 2.4, life: 1.2, size: .03, col: [c.r, c.g, c.b], drag: 1.5, grav: 3, floor: FLOOR });
    feel.coin(x, y - 10, { color: best.userData.col, pitch: 1 + Math.random() * .3 });
    v.scene.remove(best); balloons.splice(balloons.indexOf(best), 1);
  }

  return {
    reset() {
      if (!v) setup();
      v.off(); v.recenter();
      for (const b of balloons || []) v.scene.remove(b);
      balloons = []; score = 0; t = 0; spawn = 0; escaped = 0; pops.clear(); feel.clear(); ready.reset(); g.release();   // ALL round state here
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {                                  // tick: 60 below, so dt is exactly 1/60 on every phone
      v.live(); if (v.calibrating) return;          // the kit is finding or lining up the floor: wait
      feel.update(dt);
      if (feel.frozen) return;                    // hit-stop
      if (!ready.update(dt)) return;              // no balloons until the first tap
      t += dt; spawn -= dt;
      if (spawn <= 0) { spawn = Math.max(K.fastest, K.spawn - (K.spawn - K.fastest) * t / K.ramp); addBalloon(); }
      for (const b of [...balloons]) {
        b.position.y += b.userData.rise * dt; b.position.x += Math.sin(t * 1.3 + b.id) * .1 * dt;
        if (b.position.y > 2.2) { v.scene.remove(b); balloons.splice(balloons.indexOf(b), 1); escaped++; feel.hurt(); }
      }
      pops.update(dt);
      if (escaped >= K.lives) { v.off(); feel.lose(); api.over(); }
    },
    draw(c) {
      v.look();
      v.draw(c, W, H);                                   // camera picture (or virtual room) + 3D
      v.pointers(c, W, H, balloons.map(b => ({ p: b.position, col: b.userData.col })));   // arrows to balloons off screen
      feel.begin(c); feel.end(c, W, H);
      // The app draws the score top centre (api.scoreArea() says where): this HUD sits top left.
      c.fillStyle = '#fff'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('Escaped ' + escaped + '/' + K.lives, 14, 26);
      ready.draw(c, W, H);
      arNote(c, v, W, H);
    },
    // touches go to the kit first (its floor step and AR button), then the game
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; if (ready.go()) return; g.down(x, y, id); },   // the first tap only starts the round
    move(x, y, p, id) { if (v?.input?.('move', x, y, id, p)) return; g.move(x, y, p, id); },
    up(x, y, id) { if (v?.input?.('up', x, y, id)) return; g.up(x, y, id); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'AR · Arcade',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  tick: 60,                 // update(1/60) a whole number of times a frame: the same game at 30, 60 and 120 fps
  music: 'silly',           // a soundtrack in one line: happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
  goal: 20,
  hint: 'Balloons float up around your room. Turn the phone to find them and tap to pop them before five escape. No camera? Drag to look around.',
  creator: '__CREATOR__',
  make,
};
