// __TITLE__: a starter Next Gen · Console game made with `npm run new`. Change anything you like.
// Modern HD 3D (src/kit/hd3d.js, see docs/nextgen-3d.md): PBR materials, real shadows, bloom and
// GPU particles. It starts the way a finished game does: a fixed tick (the same game on every phone),
// Ready (nothing moves until the first touch), Feel (particles, shake, sound and a buzz in one call) for
// the HUD, the two-thumb layout (stick + boost button) and a soundtrack in one line.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Ready } = gs.rounds;
const { twoThumb, Keys } = gs.controls;
const { HDView, Particles, pbr, rbox, sun, surface, speckle, THREE } = gs.hd;

let W = 300, H = 300;
const ARENA = 9;   // metres from the centre to the edge

let v, ball, orbs, sparks, light;
function setup() {
  v = new HDView({ bg: '#0a0e16', fog: .045, env: .4, amb: .35 });
  light = sun('#fff0dc', 3.2, 14); v.scene.add(light, light.target); v.onTier(T => light.setTier(T));
  const tiles = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#2a3140'; col.fillRect(0, 0, S, S); speckle(col, S, 700, '#11151d', 1.5, .3);
    h.fillStyle = '#000'; for (let i = 0; i <= S; i += 64) { h.fillRect(i - 2, 0, 4, S); h.fillRect(0, i - 2, S, 4); }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), pbr('#ffffff', { tex: tiles, rep: [5, 5], rough: .45, metal: .2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; v.scene.add(floor);
  for (const [x, z, w, d] of [[0, -ARENA, ARENA * 2, .6], [0, ARENA, ARENA * 2, .6], [-ARENA, 0, .6, ARENA * 2], [ARENA, 0, .6, ARENA * 2]]) {
    const wall = new THREE.Mesh(rbox(w, .8, d, .12), pbr('#5a6578', { rough: .3, metal: .6 })); wall.position.set(x, .4, z); wall.castShadow = wall.receiveShadow = true; v.scene.add(wall);
  }
  ball = new THREE.Mesh(new THREE.SphereGeometry(.45, 32, 20), pbr('#e8eef8', { rough: .15, metal: .9, clear: 1 }));
  ball.castShadow = true; v.scene.add(ball);
  const orbMat = pbr('#40e0ff', { glow: 3, rough: .2 });
  orbs = []; for (let i = 0; i < 4; i++) { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 1), orbMat); o.castShadow = true; v.scene.add(o); orbs.push(o); }
  sparks = new Particles(v, { max: 300, additive: true });
}

function make(api) {
  const feel = new Feel();
  const ready = new Ready({ eat: false });        // the first touch starts the round and already steers
  const pad = twoThumb(W, H, { right: ['GO'] });
  const keys = new Keys();
  // Knobs: the numbers that set how it feels (docs/feel-words.md). Sliders in npm run dev (Save to file
  // writes them back); node scripts/knobs.mjs __ID__ lists them. Read K.x where it's used.
  const K = gs.tweak('Feel', {
    roll: [16, 6, 34, 'how hard the ball speeds up (metres a second, each second)'],
    boost: [34, 16, 60, 'how hard it speeds up while boosting'],
    drag: [1.6, .3, 4, 'how quickly it slows down (lower is slippery)'],
    bounce: [.6, .1, 1, 'how much speed it keeps off a wall'],
    time: [30, 10, 60, 'seconds on the clock at the start'],
    bonus: [2, 0, 5, 'seconds added for each orb'],
  });
  let pos, was, vel, score, t, time, boost;       // pos: where the ball is; was: where it was a tick ago
  const spot = o => { o.position.set((Math.random() * 2 - 1) * (ARENA - 1.5), .6, (Math.random() * 2 - 1) * (ARENA - 1.5)); };

  return {
    reset() {
      if (!v) setup();
      pos = new THREE.Vector3(0, .45, 0); was = pos.clone(); ball.position.copy(pos); ball.rotation.set(0, 0, 0);
      vel = new THREE.Vector3(); score = 0; t = 0; time = K.time; boost = 0;   // ALL round state here
      orbs.forEach(spot); sparks.clear(); feel.clear(); ready.reset(); pad.release(); keys.clear();
    },
    resize(w, h) { W = w; H = h; pad.layout(w, h); },
    update(dt) {                                  // tick: 60 below, so dt is exactly 1/60 on every phone
      feel.update(dt);
      if (feel.frozen) return;                    // hit-stop
      if (!ready.update(dt)) return;              // the clock waits for the first touch
      t += dt; time -= dt; boost = Math.max(0, boost - dt);
      const k = keys.axis(), ax = pad.left.active ? pad.left.x : k.x, az = pad.left.active ? pad.left.y : k.y;
      if ((pad.buttons.GO.pressed() || keys.held(' ')) && boost <= 0) { boost = 1.2; feel.powerup(W / 2, H * .6, { color: '#ffb060', text: '' }); }
      const acc = boost > .6 ? K.boost : K.roll;
      vel.x += ax * acc * dt; vel.z += az * acc * dt; vel.multiplyScalar(Math.exp(-K.drag * dt));
      was.copy(pos); pos.addScaledVector(vel, dt);   // keep where it was: draw() shows the moment between
      for (const a of ['x', 'z']) if (Math.abs(pos[a]) > ARENA - .75) {
        pos[a] = Math.sign(pos[a]) * (ARENA - .75);
        if (Math.abs(vel[a]) > 2) { const [sx, sy] = v.toScreen(pos.x, pos.y, pos.z); feel.hit(sx, sy, { power: Math.min(.7, Math.abs(vel[a]) / 14) }); }
        vel[a] *= -K.bounce;
      }
      ball.rotation.x += vel.z * dt / .45; ball.rotation.z -= vel.x * dt / .45;
      for (const o of orbs) {
        o.rotation.y += dt * 2; o.position.y = .6 + Math.sin(t * 3 + o.position.x) * .12;
        if (o.position.distanceTo(pos) < .8) {
          score++; api.score(score); time = Math.min(K.time, time + K.bonus);
          for (let i = 0; i < 26; i++) sparks.emit({ x: o.position.x, y: o.position.y, z: o.position.z, vx: (Math.random() - .5) * 6, vy: Math.random() * 5, vz: (Math.random() - .5) * 6, life: .7, size: .12, col: [.6, 2.4, 3], drag: 1.5, grav: 6, floor: .02 });
          const [sx, sy] = v.toScreen(o.position.x, o.position.y + .5, o.position.z); feel.coin(sx, sy, { color: '#88ffff', text: '+1 · +2s', pitch: 1 + score * .01 });
          spot(o);
        }
      }
      if (boost > .6) sparks.emit({ x: pos.x, y: .1, z: pos.z, vx: -vel.x * .2, vy: .5, vz: -vel.z * .2, life: .4, size: .1, col: [3, 1.6, .5], drag: 2 });
      sparks.update(dt);
      if (time <= 0) { feel.lose(); api.over(); }
    },
    draw(c, alpha) {                              // alpha: how far this frame is between the last two ticks
      const p = ball.position.lerpVectors(was, pos, alpha);   // smooth on 90 and 120 Hz screens
      v.cam.position.set(p.x * .6, 9, p.z * .6 + 8); v.cam.lookAt(p.x * .8, 0, p.z * .8);
      light.follow(p.x, 0, p.z);
      feel.begin(c); v.render(c, W, H); feel.end(c, W, H);
      pad.draw(c);
      // The app draws the score top centre (api.scoreArea() says where): the clock sits top left.
      c.fillStyle = time < 8 && (t * 4 | 0) % 2 ? '#ff6070' : '#ffffffdd'; c.font = '700 18px Rubik, sans-serif';
      c.textAlign = 'left'; c.fillText(Math.ceil(Math.max(0, time)) + 's', 14, 28); c.textAlign = 'center';
      ready.draw(c, W, H, { text: 'Left thumb: roll · GO: boost', size: 13, y: api.scoreArea().bottom + 26 });
    },
    down(x, y, id) { ready.go(); pad.down(x, y, id); },
    move: (x, y, pr, id) => pad.move(x, y, pr, id),
    up: (x, y, id) => pad.up(x, y, id),
    key(k, d) { if (d) ready.go(); keys.key(k, d); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Next Gen · Arcade',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  tick: 60,                 // update(1/60) a whole number of times a frame: the same game at 30, 60 and 120 fps
  music: 'chase',           // a soundtrack in one line: happy, calm, tense, spooky, heroic, sad, silly, chase, puzzle
  goal: 15,
  hint: 'Roll the chrome ball with your left thumb and collect the glowing orbs. Each one adds two seconds. Tap GO for a boost.',
  creator: '__CREATOR__',
  make,
};
