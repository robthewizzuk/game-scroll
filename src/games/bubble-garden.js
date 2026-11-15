// Bubble Garden: sleepy flower buds are dotted round your floor. Point the phone and blow on the mic (or
// hold the BLOW button) to send a stream of soap bubbles drifting out. A bubble that lands softly on a bud
// makes it bloom, and a new bud pops up somewhere else. The breeze changes, and the soap runs low.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { sounds, sfx, notes } = gs.sound;
const { haptic, want, startMic, stopMic } = gs.device;
const { Juice } = gs.juice;
const { Gestures } = gs.controls;
const { Particles, pbr, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
const { rnd } = gs.util;

let W = 300, H = 460;
const PETAL = ['#ff6fa8', '#ffd23f', '#b388ff', '#ff8a4d', '#6fd3ff'];

function make(api) {
  const ready = new Ready();   // the first touch starts the round and does nothing else
  want('motion');
  const fx = new Juice();
  let v, bubbleGeo, bubbleMat, pool, buds, sparks;
  let bubbles, score, time, t, soap, wind, windT, holding, mic, asked, ended, puffT;
  const BTN = () => ({ x: W - 136, y: H - 84, w: 124, h: 50 });
  const inBtn = (x, y) => { const b = BTN(); return x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h; };
  const g = new Gestures({ drag: (x, y, dx, dy) => { if (holding == null) v?.drag(-dx, -dy); } });

  function setup() {
    v = new ARView();
    bubbleGeo = new THREE.SphereGeometry(.06, 16, 12);
    bubbleMat = pbr('#e8f6ff', { rough: .05, clear: 1, transparent: true, opacity: .4, depthWrite: false, iridescence: 1 });
    pool = []; for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(bubbleGeo, bubbleMat); m.visible = false; v.scene.add(m); pool.push(m); }
    buds = [];
    const stemMat = pbr('#3c9a3c', { rough: .7 }), leafGeo = new THREE.SphereGeometry(.08, 10, 6), headGeo = new THREE.SphereGeometry(.07, 14, 10), petalGeo = new THREE.SphereGeometry(.06, 10, 6);
    for (let i = 0; i < 4; i++) {
      const grp = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.012, .016, .3, 6), stemMat); stem.position.y = .15;
      const leaf = new THREE.Mesh(leafGeo, stemMat); leaf.scale.set(1, .25, .5); leaf.position.set(.06, .08, 0);
      const head = new THREE.Mesh(headGeo, pbr('#7fd07f', { rough: .5 })); head.position.y = .32;
      const petals = new THREE.Group(); petals.position.y = .32;
      const pm = pbr(PETAL[i % PETAL.length], { rough: .45, sheen: 1 });
      for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(petalGeo, pm); const a = k / 6 * Math.PI * 2; p.position.set(Math.cos(a) * .09, 0, Math.sin(a) * .09); p.scale.set(1, .35, .7); p.rotation.y = -a; petals.add(p); }
      petals.scale.setScalar(.01);
      grp.add(stem, leaf, head, petals); grp.traverse(o => { o.castShadow = true; });
      v.scene.add(grp); buds.push({ grp, head, petals, bloom: 0, a: 0, d: 0 });
    }
    sparks = new Particles(v, { max: 300, additive: true });
  }
  function placeBud(b) {
    const spread = v.sensor ? Math.PI : .5;
    b.a = rnd(-spread, spread); b.d = v.sensor ? rnd(1.6, 3.2) : rnd(2.2, 3.4); b.bloom = 0; b.petals.scale.setScalar(.01); b.head.material.color.set('#7fd07f');
    b.grp.position.set(-Math.sin(b.a) * b.d, FLOOR, -Math.cos(b.a) * b.d); b.grp.scale.setScalar(.01); b.grow = 0;
  }
  function puff(power) {
    const m = pool.find(p => !p.visible); if (!m) return;
    const f = v.forward(new THREE.Vector3()), e = v.eyePos;
    const sp = .9 + power * 1.4;
    m.visible = true; m.position.set(e.x + f.x * .25, e.y + f.y * .25 - .05, e.z + f.z * .25);
    const s = rnd(.7, 1.5); m.scale.setScalar(s);
    bubbles.push({ m, vx: f.x * sp + rnd(-.12, .12), vy: f.y * sp + rnd(.05, .25), vz: f.z * sp + rnd(-.12, .12), s, wob: Math.random() * 6 });
  }
  function popAt(b, good) {
    const p = b.m.position;
    for (let i = 0; i < (good ? 30 : 8); i++) sparks.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-.6, .6), vy: rnd(0, .8), vz: rnd(-.6, .6), life: .5, size: .025, col: good ? [3, 2.6, 1.4] : [1.2, 1.5, 1.8], drag: 2, grav: 1 });
    b.m.visible = false; bubbles.splice(bubbles.indexOf(b), 1);
  }

  return {
    reset() {
      if (!v) setup();
      v.off(); v.recenter(); stopMic(); mic = null; asked = false;
      for (const b of bubbles || []) b.m.visible = false;
      bubbles = []; score = 0; time = 90; t = 0; soap = 1; wind = 0; windT = 4; holding = null; ready.reset(); ended = false; puffT = 0;
      for (const b of buds) placeBud(b);
      sparks.clear(); fx.clear(); g.release();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      v.live(); if (v.calibrating) return;   // finding or lining up the floor: the round waits
      fx.update(dt); sparks.update(dt); t += dt;
      for (const b of buds) { b.grow = Math.min(1, (b.grow || 0) + dt * 2); b.grp.scale.setScalar(b.grow); if (b.bloom > 0) { b.bloom += dt; b.petals.scale.setScalar(Math.min(1, b.bloom * 2)); if (b.bloom > 1.4) placeBud(b); } }
      if (!ready.playing || ended) return;
      time -= dt;
      windT -= dt; if (windT <= 0) { windT = rnd(4, 8); wind = rnd(-.25, .25); }
      // blowing: the mic (how hard), or the button
      const blow = holding != null ? .7 : mic ? (mic.blow() > .25 ? mic.blow() : 0) : 0;
      if (blow > 0 && soap > 0) { puffT -= dt; soap = Math.max(0, soap - dt * .16); if (puffT <= 0) { puffT = .12; puff(blow); if (Math.random() < .4) sfx(1400 + Math.random() * 600, .03, 'sine', .015); } }
      else soap = Math.min(1, soap + dt * .12);
      const f = v.forward(new THREE.Vector3()), side = { x: -f.z, z: f.x };
      for (const b of [...bubbles]) {
        b.vy -= .32 * dt; b.vx += (wind * side.x) * dt; b.vz += (wind * side.z) * dt;
        const dr = Math.exp(-.4 * dt); b.vx *= dr; b.vz *= dr; b.vy = Math.max(-.45, b.vy * dr);
        const p = b.m.position; p.x += b.vx * dt + Math.sin(t * 3 + b.wob) * .002; p.y += b.vy * dt; p.z += b.vz * dt;
        // a bud catches it
        const bud = buds.find(k => !k.bloom && Math.hypot(k.grp.position.x - p.x, k.grp.position.z - p.z) < .2 && p.y < FLOOR + .42 && p.y > FLOOR + .2);
        if (bud) {
          bud.bloom = .01; bud.head.material.color.set('#ffe680'); score++; api.score(score); time = Math.min(90, time + 2);
          notes(['C6', 'E6', 'G6', 'A6'][score % 4], { len: .08, vol: .04 }); haptic('success');
          const [sx, sy] = v.toScreen(p.x, p.y + .3, p.z); fx.pop(sx, sy, '+1', { size: 20, color: '#ffe680' });
          popAt(b, true); continue;
        }
        if (p.y < FLOOR + .03 || Math.hypot(p.x, p.z) > 8) { if (Math.random() < .5) sfx(2200, .02, 'sine', .01); popAt(b, false); }
      }
      if (time <= 0 && !ended) { ended = true; v.off(); stopMic(); sounds.win?.(); api.over(); }
    },
    pause() { stopMic(); mic = null; asked = false; },
    draw(c) {
      v.look();
      v.draw(c, W, H);
      v.pointers(c, W, H, buds.filter(b => !b.bloom).map((b, i) => ({ p: b.grp.position, col: PETAL[buds.indexOf(b) % PETAL.length] })));
      fx.begin(c); fx.end(c, W, H);
      // soap and time
      c.fillStyle = '#00000060'; c.fillRect(14, 36, 90, 8); c.fillStyle = soap < .2 ? '#ff8080' : '#9fe0ff'; c.fillRect(14, 36, 90 * soap, 8);
      c.textAlign = 'left'; c.font = '700 16px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(Math.ceil(Math.max(0, time)) + 's', 14, 28);
      c.font = '600 10px Rubik, sans-serif'; c.fillText('SOAP', 108, 44);
      // the blow button
      const b = BTN(); c.fillStyle = holding != null ? '#9fe0ffd0' : '#ffffffb0'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 25); c.fill();
      c.fillStyle = '#163050'; c.textAlign = 'center'; c.font = '800 15px Rubik, sans-serif'; c.fillText(ready.playing ? 'HOLD TO BLOW' : 'TAP TO START', b.x + b.w / 2, b.y + 30);
      if (!ready.playing || t < 3) { c.fillStyle = '#fff'; c.font = '600 12px Rubik, sans-serif'; c.fillText(mic ? 'Blow on the mic or hold the button' : 'Point at a bud and blow bubbles onto it', W / 2, b.y - 34); }
      arNote(c, v, W, H);
    },
    down(x, y, id) {
      if (v?.input?.('down', x, y, id)) return;   // the AR kit's floor panels get touches first
      if (inBtn(x, y)) {
        if (ready.go()) { if (!asked) { asked = true; startMic().then(m => { mic = m; }).catch(() => {}); } return; }
        holding = id; return;
      }
      g.down(x, y, id);
    },
    move: (x, y, p, id) => { if (v?.input?.('move', x, y, id, p)) return; if (id !== holding) g.move(x, y, p, id); },
    up: (x, y, id) => { if (v?.input?.('up', x, y, id)) return; if (id === holding) { holding = null; return; } g.up(x, y, id); },
    key(k, d) { if (k === ' ') { if (d) ready.go(); holding = d && ready.playing ? 'key' : null; } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'bubble-garden',
  title: 'Bubble Garden',
  tag: 'AR · Gentle',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 15,
  hint: 'Point the phone at a flower bud on your floor and blow on the mic (or hold the button) to drift bubbles onto it. Each bud you land one on blooms. No camera? Drag to look around.',
  make,
};
