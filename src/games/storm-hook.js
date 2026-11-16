import gs from '../gamescroll.js';
const { Timers } = gs.math;
const { sounds, noise, tone } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Ready } = gs.rounds;
const { HDView, Particles, pbr, rbox, surface, speckle, sun, THREE } = gs.hd;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, CylinderGeometry, SphereGeometry, CapsuleGeometry, BoxGeometry, PlaneGeometry, OctahedronGeometry, ConeGeometry, Color } = THREE;

// Storm Hook: swing across a stormy harbour city on a grapple line. Hold to fire the hook at the
// next glowing anchor and swing; let go to fly. Time your release at the bottom-to-forward part of
// the swing to carry speed, grab spark crystals in mid-air, and never drop to the street. Lightning
// lights up the skyline (and rumbles the phone).
// One thumb: hold to hook, slide sideways while swinging to steer. Two thumbs: left steers, right holds the hook.
let W = 300, H = 300;
const G = 24, LOW = 5;

let MT = null;
function looks() {
  if (MT) return MT;
  const conc = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#3a4048'; col.fillRect(0, 0, S, S); speckle(col, S, 1200, '#1a1e24', 2, .4); speckle(col, S, 400, '#6a7078', 1.5, .3);
    for (let y = 0; y < S; y += 32) for (let x = 0; x < S; x += 32) { col.fillStyle = Math.random() < .35 ? '#ffd890' : '#0c1018'; col.globalAlpha = .9; col.fillRect(x + 8, y + 8, 16, 18); h.fillStyle = '#404040'; h.fillRect(x + 6, y + 6, 20, 22); }
    col.globalAlpha = 1;
  }, { strength: 2 });
  const lit = conc.repeat(2, 4); const tower = pbr('#ffffff', { tex: lit, rough: .55, metal: .3 }); tower.emissiveMap = lit.map; tower.emissive = new Color('#ff9a40'); tower.emissiveIntensity = .35;
  MT = {
    tower, roof: pbr('#262a30', { rough: .8 }), water: pbr('#0c1a24', { rough: .05, metal: .7 }),
    mast: pbr('#9aa4b0', { rough: .25, metal: 1 }), anchor: pbr('#ffd23a', { glow: 3 }), next: pbr('#4ad8ff', { glow: 4 }),
    suit: pbr('#1c3f8a', { rough: .45, sheen: 1 }), cape: pbr('#e8323a', { rough: .6, side: THREE.DoubleSide }), skin: pbr('#f0c8a0', { rough: .6 }), visor: pbr('#20e0ff', { glow: 1.5, rough: .1 }),
    rope: pbr('#c8f4ff', { glow: 2.5 }), gem: pbr('#b070ff', { glow: 3, rough: .1 }), beacon: pbr('#ff3030', { glow: 4 }),
  };
  return MT;
}
function makeHero() {
  const m = looks(), g = new Group();
  const body = new Mesh(new CapsuleGeometry(.32, .7, 6, 12), m.suit); body.position.y = 0; g.add(body);
  const head = new Mesh(new SphereGeometry(.26, 18, 14), m.skin); head.position.y = .72; g.add(head);
  const visor = new Mesh(rbox(.36, .1, .1, .04), m.visor); visor.position.set(0, .76, .2); g.add(visor);
  const cape = new Mesh(new PlaneGeometry(.75, 1.2, 1, 4), m.cape); cape.position.set(0, .05, -.36); g.add(cape);
  const arm = new Mesh(new CapsuleGeometry(.09, .6, 4, 8), m.suit); arm.position.set(.25, .65, 0); g.add(arm);
  for (const x of [-.14, .14]) { const leg = new Mesh(new CapsuleGeometry(.11, .55, 4, 8), m.suit); leg.position.set(x, -.75, 0); g.add(leg); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { cape, arm };
  return g;
}

function make(api) {
  const timers = new Timers(), later = (fn, ms) => timers.after(ms / 1000, fn);   // game-time delays: they pause with the game
  let v, hero, rope, ropeMesh, anchors, towers, gems, gemMesh, sunL, rain, spark, built, mx = new Object3D();
  let press = false, p, vel, hook, steer, holding, fingers, keys, t, dist, bonus, msg, flashT, nextBolt, best, farZ, gemN, swingT;
  const ready = new Ready({ eat: false, text: 'Hold to hook on' });     // the hero hangs in the air until the first touch
  let fdt = 1 / 60;
  const tmp = new Vector3(), tmp2 = new Vector3(), camPos = new Vector3();

  function setup() {
    v = new HDView({ bg: '#0d121c', fog: .022, env: .35, sky: '#5a6a8a', ground: '#141820', amb: .55, fov: 68 }).lampLights(30);
    v.exposure = 1; v.bloom = .7;
    sunL = sun('#a8b8e0', 1.2, 24, [.3, 1, -.4]); v.scene.add(sunL, sunL.target); v.onTier(T => sunL.setTier(T));
    // a storm at night: everything soaked and shining, haze glowing round the lamps, lens flare and grain (the game's own moon and colours kept)
    v.look('night rain', { sun: false, bg: '#0d121c', sky: '#5a6a8a', ground: '#141820', amb: .55, env: .35, exposure: 1, bloom: .7, glare: .3, air: { haze: .01, colour: '#0e121c', sunColour: '#1c2436', mist: 0, clouds: 0, wet: .45 }, eye: { amount: .3, min: .85, max: 1.2, speed: .7 }, flare: { strength: .3, threshold: .55, dirt: .45, tint: [1, .85, .7] }, film: { halation: .3, grain: 1.6, fringe: .02 } });
    const water = new Mesh(new PlaneGeometry(600, 900), looks().water); water.rotation.x = -Math.PI / 2; water.position.set(0, -14, 300); v.scene.add(water);
    hero = makeHero(); hero.scale.setScalar(1.3); v.scene.add(hero);
    ropeMesh = new Mesh(new CylinderGeometry(.035, .035, 1, 6), looks().rope); ropeMesh.visible = false; v.scene.add(ropeMesh);
    // pools reused as the city scrolls by
    towers = new InstancedMesh(rbox(1, 1, 1, .03), looks().tower, 120); towers.castShadow = towers.receiveShadow = true; towers.frustumCulled = false; v.scene.add(towers);
    anchors = []; for (let i = 0; i < 14; i++) {
      const g = new Group(), m = looks();
      const mast = new Mesh(new CylinderGeometry(.12, .18, 1, 8), m.mast); mast.castShadow = true; g.add(mast);
      const arm = new Mesh(new BoxGeometry(.2, .2, 3), m.mast); arm.position.set(0, .5, 1.3); g.add(arm);
      const ring = new Mesh(new OctahedronGeometry(.45), m.anchor); ring.position.set(0, .5, 2.8); g.add(ring);
      const bea = new Mesh(new SphereGeometry(.12, 8, 6), m.beacon); g.add(bea);
      g.userData = { mast, ring, bea }; v.scene.add(g); anchors.push({ g, p: new Vector3(), used: false });
    }
    gemMesh = new InstancedMesh(new OctahedronGeometry(.4), looks().gem, 30); gemMesh.frustumCulled = false; v.scene.add(gemMesh);
    rain = new Particles(v, { max: 500, additive: true }); spark = new Particles(v, { max: 300, additive: true });
  }
  // lay out anchors + towers ahead of the player
  let tI = 0, aI = 0;
  function spawnAnchor(z) {
    const a = anchors[aI++ % anchors.length], x = rnd(-7, 7), y = rnd(18, 27) + Math.min(6, z / 600);
    a.p.set(x, y, z); a.used = false;
    // a tower under it; the anchor is the tip of a crane arm on its roof
    const roof = rnd(-4, 3.5), base = -14, w = rnd(9, 15), d = rnd(9, 15);
    a.g.position.set(x, roof, z - 2.8); const mh = y - .5 - roof; a.g.userData.mast.scale.y = mh; a.g.userData.mast.position.y = mh / 2;
    a.g.userData.ring.position.set(0, mh + .5, 2.8); a.g.userData.ring.parent.children[1].position.set(0, mh + .5, 1.3); a.g.userData.bea.position.y = mh + .7;
    mx.position.set(x, (roof + base) / 2, z - 2.8); mx.rotation.set(0, 0, 0); mx.scale.set(w, roof - base, d); mx.updateMatrix(); towers.setMatrixAt(tI++ % 120, mx.matrix);
    // side towers for the skyline
    for (const s of [-1, 1]) { const tw = rnd(10, 20), th = rnd(20, 60); mx.position.set(s * rnd(24, 40), base + th / 2, z + rnd(-6, 6)); mx.scale.set(tw, th, rnd(10, 18)); mx.updateMatrix(); towers.setMatrixAt(tI++ % 120, mx.matrix); }
    towers.instanceMatrix.needsUpdate = true;
    // a crystal or two in the arc before it
    if (Math.random() < .7) { const k = gemN++ % 30; gems[k] = { p: new Vector3(x + rnd(-3, 3), y - rnd(6, 11), z - rnd(6, 9)), on: true }; }
    farZ = z;
  }
  function bestAnchor() {
    let best = null, bs = -1e9;
    for (const a of anchors) {
      const dz = a.p.z - p.z, dd = a.p.distanceTo(p);
      if (dz < 1 || dd > 34 || a.p.y < p.y - 2) continue;
      const s = -Math.abs(dz - 13) - Math.abs(a.p.x - p.x) * .6;
      if (s > bs) { bs = s; best = a; }
    }
    return best;
  }
  function attach() {
    const a = bestAnchor(); if (!a) { msg = { txt: 'NOTHING IN RANGE', l: .7, col: '#ff8a8a' }; return; }
    hook = a; hook.L = a.p.distanceTo(p) * .9; swingT = 0; a.used = true;
    haptic('medium'); tone(900, { len: .08, wave: 'square', vol: .04, slide: -500 }); noise(.08, { vol: .05, from: 5000, to: 2000, filter: 'highpass' });
  }
  function release() { if (!hook) return; hook = null; tone(500, { len: .1, wave: 'triangle', vol: .04, slide: 300 }); haptic('light'); }
  function bolt() {
    flashT = .25; nextBolt = rnd(3, 7); haptic('heavy');
    later(() => { noise(1.2, { vol: .16, from: 900, to: 40 }); haptic('medium'); }, 250);
    const x = rnd(-60, 60), z = p.z + rnd(40, 120); let y = 70;
    for (let i = 0; i < 40; i++) { const nx = x + rnd(-4, 4); spark.emit({ x: nx, y, z, life: .25, size: .9, col: [3, 3.5, 6] }); y -= 2; }
  }
  function update(dt) { timers.update(dt);
    fdt = dt; if (!ready.update(dt)) return fx(dt);
    t += dt; flashT = Math.max(0, flashT - dt); nextBolt -= dt; if (nextBolt <= 0) bolt();
    if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    const k = keys; let s = steer;
    if (k.has('ArrowLeft') || k.has('a')) s = -1; else if (k.has('ArrowRight') || k.has('d')) s = 1;
    const want = holding || k.has(' ');
    if (press && !hook) attach(); press = false; if (!want && hook) release();   // a new press fires the hook; letting go releases
    vel.y -= G * dt; vel.x += -s * 12 * dt; vel.x *= Math.exp(-.8 * dt);
    if (hook) {
      swingT += dt;
      // a little pull and a forward pump on the downswing keep the swing lively
      tmp.copy(hook.p).sub(p); const below = tmp.y > 0;
      if (below && vel.z < 30) vel.z += 9 * dt;
      hook.L = Math.max(6, hook.L - dt * 1.5);
    }
    p.addScaledVector(vel, dt);
    if (hook) {
      tmp.copy(p).sub(hook.p); const d = tmp.length();
      if (d > hook.L) { tmp.multiplyScalar(1 / d); p.copy(hook.p).addScaledVector(tmp, hook.L); const out = vel.dot(tmp); if (out > 0) vel.addScaledVector(tmp, -out); }
      // swung past the anchor: it lets go on its own
      if (p.z > hook.p.z + 4 && p.y > hook.p.y - 2) release();
    }
    if (vel.length() > 42) vel.setLength(42);
    // distance + crystals
    const dz = Math.floor(p.z / 10); if (dz > dist) { dist = dz; api.score(dist + bonus); }
    for (const g of gems) if (g?.on && g.p.distanceTo(p) < 1.6) {
      g.on = false; bonus += 25; api.score(dist + bonus); sounds.coin(1.2); haptic('success'); msg = { txt: '+25', l: .8, col: '#d0a0ff' };
      for (let i = 0; i < 30; i++) spark.emit({ x: g.p.x, y: g.p.y, z: g.p.z, vx: rnd(-5, 5), vy: rnd(-5, 5), vz: rnd(-5, 5), life: .5, size: .12, col: [2.5, 1.2, 4], drag: 2 });
    }
    while (farZ < p.z + 140) spawnAnchor(farZ + rnd(16, 23));
    if (p.y < LOW) { haptic('error'); sounds.lose(); return api.over(); }
    fx(dt);
  }
  function fx(dt) {
    for (let i = 0; i < 8; i++) rain.emit({ x: p.x + rnd(-16, 16), y: p.y + rnd(0, 14), z: p.z + rnd(-6, 26), vx: 3, vy: -30, vz: -vel.z * .5, life: .5, size: .04, col: [.5, .6, .8], a: .55 });
    rain.update(dt); spark.update(dt);
  }
  function draw(c) {
    if (!v) self.reset();
    hero.position.copy(p);
    const sp = vel.length();
    hero.rotation.set(clamp(-vel.y * .02, -.6, .6), Math.atan2(vel.x, Math.max(1, vel.z)) * .5, 0);
    const cape = hero.userData.cape; cape.rotation.x = -.3 - clamp(sp * .03, 0, 1.1) + Math.sin(t * 18) * .08;
    if (hook) {
      tmp.copy(hook.p).sub(p); const L = tmp.length();
      ropeMesh.visible = true; ropeMesh.position.copy(p).addScaledVector(tmp, .5); ropeMesh.scale.set(1, L, 1);
      ropeMesh.quaternion.setFromUnitVectors(tmp2.set(0, 1, 0), tmp.normalize());
      hero.userData.arm.rotation.x = -2.6;
    } else { ropeMesh.visible = false; hero.userData.arm.rotation.x = -.4; }
    // anchors: the one you'd grab now glows blue
    const nxt = !hook && bestAnchor();
    for (const a of anchors) a.g.userData.ring.material = a === nxt || a === hook ? looks().next : looks().anchor;
    gems.forEach((g, i) => { if (g?.on) { mx.position.copy(g.p); mx.rotation.set(0, t * 2 + i, 0); mx.scale.setScalar(1); } else mx.scale.setScalar(0); mx.updateMatrix(); gemMesh.setMatrixAt(i, mx.matrix); });
    gemMesh.instanceMatrix.needsUpdate = true;
    // camera behind, a bit above and to the side
    tmp.set(p.x * .6 + 2, p.y + 4, p.z - 12);
    if (!camPos.lengthSq() || camPos.distanceTo(tmp) > 30) camPos.copy(tmp); camPos.lerp(tmp, 1 - Math.pow(.9, fdt * 60));
    v.cam.position.copy(camPos); v.cam.lookAt(p.x * .8, p.y + 1, p.z + 10);
    const fov = 66 + clamp((sp - 15) * .5, 0, 14); if (Math.abs(v.cam.fov - fov) > .2) { v.cam.fov += (fov - v.cam.fov) * (1 - Math.pow(.9, fdt * 60)); v.cam.updateProjectionMatrix(); }
    sunL.follow(p.x, 0, p.z + 10);
    v.placeLamps(anchors.map(a => ({ x: a.p.x, y: a.p.y + 1, z: a.p.z, col: '#ffcc66', i: 45 })), p.x, p.y, p.z, t);
    v.exposure = 1 + flashT * 6; v.hemi.intensity = .55 + flashT * 6;
    v.hurt = p.y < LOW + 4 ? (LOW + 4 - p.y) / 4 * .6 : 0;
    v.render(c, W, H); hud(c, sp, nxt);
  }
  function hud(c, sp, nxt) {
    const u = Math.min(W, H) / 300; c.save(); c.textBaseline = 'middle';
    c.fillStyle = '#05070cb0'; c.beginPath(); c.roundRect(8 * u, 8 * u, 92 * u, 34 * u, 10 * u); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `800 ${16 * u}px Rubik, sans-serif`; c.fillText(String(dist + bonus), 16 * u, 22 * u);
    c.font = `700 ${7 * u}px Rubik, sans-serif`; c.fillStyle = '#9fd8ff'; c.fillText(`${dist * 10} M · ${Math.round(sp * 3.6)} KM/H`, 16 * u, 35 * u);
    // height warning
    if (p.y < LOW + 5) { c.textAlign = 'center'; c.fillStyle = '#ff6070'; c.font = `800 ${12 * u}px Rubik, sans-serif`; c.fillText('TOO LOW! HOOK ON', W / 2, H * .2); }
    // where the next anchor is, when it's off to the side
    if (nxt) { const [sx, sy, sz] = v.toScreen(nxt.p.x, nxt.p.y, nxt.p.z); if (sz < 1 && sx > 0 && sx < W && sy > 0 && sy < H) { c.strokeStyle = '#4ad8ff'; c.lineWidth = 2 * u; c.beginPath(); c.arc(sx, sy, 12 * u + Math.sin(t * 8) * 2 * u, 0, 7); c.stroke(); } }
    if (msg) { c.textAlign = 'center'; c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.col; c.font = `800 ${16 * u}px Rubik, sans-serif`; c.fillText(msg.txt, W / 2, H * .3); c.globalAlpha = 1; }
    if (ready.playing && t < 4) { c.textAlign = 'center'; c.fillStyle = '#ffffffd8'; c.font = `600 ${8.5 * u}px Rubik, sans-serif`; c.fillText('Hold to hook the glowing anchor · let go to fly · slide to steer', W / 2, H * .6); }
    c.restore();
    ready.draw(c, W, H, { size: 13 * u, y: H * .8 });
  }
  const self = {
    reset() { timers.clear();
      if (!v) setup();
      p = new Vector3(0, 16, 0); vel = new Vector3(0, 4, 16); hook = null; steer = 0; holding = false; fingers = {}; keys = new Set();
      t = 0; dist = 0; bonus = 0; msg = null; flashT = 0; nextBolt = 2.5; farZ = 0; gemN = 0; gems = []; tI = 0; aI = 0; swingT = 0;
      for (let i = 0; i < 120; i++) { mx.scale.setScalar(0); mx.updateMatrix(); towers.setMatrixAt(i, mx.matrix); }
      spawnAnchor(8); while (farZ < 140) spawnAnchor(farZ + rnd(16, 23));
      camPos.set(0, 0, 0); rain.clear(); spark.clear(); v.warmed = false; ready.reset();
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) { rain.update(dt); spark.update(dt); } },
    // a finger on the left half steers (when another finger holds the hook); otherwise any finger holds the hook and steers by sliding
    down(x, y, id = 0) {
      ready.go();
      const f = { id, ax: x, x };
      if (!fingers.hook && (x >= W / 2 || fingers.steer)) { fingers.hook = f; holding = true; press = true; }
      else if (!fingers.steer) { fingers.steer = f; if (!fingers.hook) { fingers.hook = f; holding = true; press = true; } }
    },
    move(x, y, pr, id = 0) { if (!pr) return; if (fingers.steer?.id === id) steer = clamp((x - fingers.steer.ax) / (W * .15), -1, 1); else if (fingers.hook?.id === id && !fingers.steer) steer = clamp((x - fingers.hook.ax) / (W * .15), -1, 1); },
    up(x, y, id = 0) {
      if (fingers.hook?.id === id) { fingers.hook = null; holding = false; if (fingers.steer?.id === id) fingers.steer = null; steer = fingers.steer ? steer : 0; }
      else if (fingers.steer?.id === id) { fingers.steer = null; steer = 0; }
    },
    key(k, d) { if (d) ready.go(); if (d && k === ' ' && !keys.has(' ')) press = true; if (d) keys.add(k); else keys.delete(k); },
  };
  return self;
}

export default {
  id: 'storm-hook',
  title: 'Storm Hook',
  tag: 'Next Gen · Action',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 60, reward: 25,
  hint: 'Swing across a stormy harbour city. Hold to fire your grapple at the glowing anchor, let go to fly, then hold again for the next one. Slide sideways to steer. Grab purple crystals for bonus points and never drop to the street.',
  traits: ['theme:city'],
  make,
};
