// Echo Drums: five drums stand in a ring around you, one in every direction. They play a little rhythm,
// lighting up as they sound; turn to each one and tap it to play the rhythm back in the same order. Each
// round adds a beat. Get one wrong and you lose a drumstick, and the rhythm plays again. Three sticks.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { sounds, sfx } = gs.sound;
const { haptic, want } = gs.device;
const { Juice } = gs.juice;
const { Gestures } = gs.controls;
const { Particles, pbr, rbox, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;

let W = 300, H = 460;
const DRUMS = [
  { col: '#ff4d6d', f: 196, name: 'RED' }, { col: '#ffd23f', f: 247, name: 'YELLOW' }, { col: '#3ddc97', f: 294, name: 'GREEN' },
  { col: '#4fc3ff', f: 349, name: 'BLUE' }, { col: '#b388ff', f: 392, name: 'PURPLE' },
];

function make(api) {
  const ready = new Ready();   // the first touch starts the round and does nothing else
  want('motion');
  const fx = new Juice();
  let v, drums, sparks, wide;
  let seq, step, mode, wait, sticks, score, t, ended, round, msg, ml;
  const g = new Gestures({ tap: (x, y) => tapAt(x, y), drag: (x, y, dx, dy) => v?.drag(-dx, -dy) });

  function setup() {
    v = new ARView();
    drums = DRUMS.map((d, i) => {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.22, .2, .5, 28), pbr(d.col, { rough: .35, clear: 1 }));
      body.position.y = .25;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.22, .02, 8, 28), pbr('#d8d8e0', { rough: .2, metal: .9 })); rim.rotation.x = Math.PI / 2; rim.position.y = .5;
      const skinMat = pbr('#f4ecd8', { rough: .7, glow: 0, glowCol: d.col });
      const skin = new THREE.Mesh(new THREE.CylinderGeometry(.21, .21, .02, 28), skinMat); skin.position.y = .5;
      const legs = new THREE.Mesh(rbox(.06, .5, .06, .02), pbr('#30303a', { metal: .6, rough: .4 })); legs.position.y = -.25;
      grp.add(body, rim, skin, legs); grp.traverse(o => { o.castShadow = true; });
      v.scene.add(grp);
      return { ...d, grp, skin, skinMat, flash: 0, i };
    });
    sparks = new Particles(v, { max: 300, additive: true });
  }
  function layout() {
    // all the way round you with a gyro; a gentle fan in front without one
    wide = !!v.sensor; const spread = wide ? Math.PI * 2 / 5 : .22;
    drums.forEach((d, i) => { const a = (i - 2) * spread, r = wide ? 2.2 : 3; d.a = a; d.grp.position.set(-Math.sin(a) * r, FLOOR + .5, -Math.cos(a) * r); d.grp.lookAt(0, FLOOR + .5, 0); });
  }
  function hit(d, mine) {
    d.flash = .35; sfx(d.f, .35, 'triangle', .07, -d.f * .3); sfx(d.f * 2, .08, 'sine', .03);
    if (mine) haptic('medium');
    const p = d.grp.position, c = new THREE.Color(d.col);
    for (let i = 0; i < 14; i++) sparks.emit({ x: p.x, y: p.y + .55, z: p.z, vx: (Math.random() - .5) * 1.2, vy: Math.random() * 1.6, vz: (Math.random() - .5) * 1.2, life: .5, size: .03, col: [c.r * 2, c.g * 2, c.b * 2], drag: 2, grav: 3 });
  }
  function nextRound() { round++; seq.push(Math.random() * 5 | 0); play(.9); }
  function play(delay) { mode = 'show'; step = 0; wait = delay; msg = 'LISTEN'; ml = 99; }

  function tapAt(x, y) {
    if (!v || ended) return;
    if (ready.go()) { nextRound(); return; }
    if (mode !== 'you') return;
    let best = null, bd = 60;
    for (const d of drums) { const p = d.grp.position, [sx, sy, z] = v.toScreen(p.x, p.y + .25, p.z); const dist = Math.hypot(sx - x, sy - y); if (z < 1 && dist < bd) { bd = dist; best = d; } }
    if (!best) return;
    hit(best, true);
    if (best.i === seq[step]) {
      step++; score++; api.score(score);
      if (step === seq.length) { mode = 'wait'; wait = .9; msg = 'NICE!'; ml = .8; fx.pop(W / 2, H * .3, `${seq.length} BEATS`, { size: 22, color: '#ffe680' }); sounds.coin(1.2); }
    } else {
      sticks--; haptic('error'); fx.flash('#ff4060', .3).shake(4); sfx(110, .4, 'sawtooth', .05);
      if (sticks <= 0) { ended = true; v.off(); sounds.lose(); msg = 'OUT OF STICKS'; ml = 2; api.over(); return; }
      msg = 'WRONG DRUM: AGAIN'; ml = 1.2; play(1.4);
    }
  }

  return {
    reset() {
      if (!v) setup();
      v.off(); v.recenter(); layout();
      seq = []; step = 0; mode = 'idle'; wait = 0; sticks = 3; score = 0; t = 0; ready.reset(); ended = false; round = 0; msg = ''; ml = 0;
      sparks.clear(); fx.clear(); g.release();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      v.live(); if (v.calibrating) return;   // finding or lining up the floor: the round waits
      fx.update(dt); sparks.update(dt); t += dt; if (ml > 0 && ml < 90) ml -= dt;
      if (!!v.sensor !== wide) layout();   // the gyro woke up: spread the drums all round
      for (const d of drums) { d.flash = Math.max(0, d.flash - dt); d.skinMat.emissiveIntensity = d.flash * 8; d.skin.scale.y = 1 - d.flash * 1.5; }
      if (!ready.playing || ended) return;
      if (mode === 'show') {
        wait -= dt;
        if (wait <= 0) {
          if (step < seq.length) { hit(drums[seq[step]], false); step++; wait = Math.max(.35, .7 - round * .025); }
          else { mode = 'you'; step = 0; msg = 'YOUR TURN'; ml = 1.2; }
        }
      } else if (mode === 'wait') { wait -= dt; if (wait <= 0) nextRound(); }
    },
    draw(c) {
      v.look();
      v.draw(c, W, H);
      // while the rhythm plays, point at the drum that is sounding; on your turn, at nothing
      const showing = mode === 'show' ? drums.filter(d => d.flash > .2) : [];
      v.pointers(c, W, H, (showing.length ? showing : drums).map(d => ({ p: d.grp.position, col: d.col })));
      fx.begin(c); fx.end(c, W, H);
      for (let i = 0; i < 3; i++) { c.save(); c.translate(18 + i * 14, 24); c.rotate(-.5); c.fillStyle = i < sticks ? '#e0b070' : '#ffffff30'; c.fillRect(-2, -10, 4, 20); c.beginPath(); c.arc(0, -10, 3.5, 0, 7); c.fill(); c.restore(); }
      c.textAlign = 'center';
      if (ml > 0 && ready.playing) { c.fillStyle = '#fff'; c.font = '800 18px Rubik, sans-serif'; c.fillText(msg, W / 2, H * .8); if (mode === 'show') { c.font = '600 12px Rubik, sans-serif'; c.fillText(`${step} of ${seq.length}`, W / 2, H * .8 + 18); } }
      if (mode === 'you') { c.font = '600 12px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(`Beat ${step + 1} of ${seq.length}`, W / 2, H * .8 + 20); }
      if (!ready.playing) { c.fillStyle = '#fff'; c.font = '700 16px Rubik, sans-serif'; c.fillText('Listen, then play it back', W / 2, H * .78); c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#e0e0ff'; c.fillText('Turn the phone (or drag) to find each drum. Tap to start', W / 2, H * .78 + 20); }
      arNote(c, v, W, H);
    },
    // the AR kit gets touches first: its floor panels (Skip, Done, the Floor chip) use them
    down: (x, y, id) => { if (!v?.input?.('down', x, y, id)) g.down(x, y, id); },
    move: (x, y, p, id) => { if (!v?.input?.('move', x, y, id, p)) g.move(x, y, p, id); },
    up: (x, y, id) => { if (!v?.input?.('up', x, y, id)) g.up(x, y, id); },
    key(k, d) { if (!d) return; if (ready.go()) nextRound(); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'echo-drums',
  title: 'Echo Drums',
  tag: 'AR · Memory',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 30,
  hint: 'Five drums stand round you. Watch and listen as they play, then turn and tap them in the same order. Each round adds a beat. No camera? Drag to look around.',
  make,
};
