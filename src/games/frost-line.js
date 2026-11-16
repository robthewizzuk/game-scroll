import gs from '../gamescroll.js';
const { sounds, noise, tone } = gs.sound;
const { haptic, want, tilt, calibrateTilt } = gs.device;
const { clamp, rnd } = gs.util;
const { Ready } = gs.rounds;
const { HDView, Particles, pbr, rbox, surface, speckle, sun, THREE } = gs.hd;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, PlaneGeometry, ConeGeometry, CylinderGeometry, CapsuleGeometry, SphereGeometry, DodecahedronGeometry, BoxGeometry, Color } = THREE;

// Frost Line: snowboard down an endless mountain with an avalanche roaring behind you. Tilt the
// phone (or drag) to carve; straight lines are fastest, but trees and rocks are in the way. Hit a
// kicker to launch, then swipe in the air for a trick: sideways spins, up flips. Land it for points
// and a speed boost; land half-way round and you wipe out. Too slow and the avalanche takes you.
let W = 300, H = 300;
const SLOPE = .38, TILE = 160, WID = 70;
// the mountain: one height function, so the leap-frogging tiles always line up
const bump = (x, z) => Math.sin(x * .11 + z * .05) * 1.1 + Math.sin(x * .23 - z * .13) * .5 + Math.sin(z * .021) * 2.5 + Math.abs(x) ** 1.6 * .012;
const ground = (x, z) => -z * SLOPE + bump(x, z);

let MT = null;
function looks() {
  if (MT) return MT;
  const snow = surface(256, ({ col, h, r, size: S }) => {
    col.fillStyle = '#e4ecf6'; col.fillRect(0, 0, S, S); speckle(col, S, 900, '#b0c4e0', 2, .35);
    h.fillStyle = '#808080'; h.fillRect(0, 0, S, S); speckle(h, S, 2500, '#fff', 1.4, .5); speckle(h, S, 1500, '#000', 1.4, .4);
    for (let i = 0; i < 30; i++) { h.strokeStyle = '#ffffff30'; h.lineWidth = rnd(2, 6); h.beginPath(); const x = rnd(0, S); h.moveTo(x, 0); h.bezierCurveTo(x + rnd(-40, 40), S / 3, x + rnd(-40, 40), S * .66, x, S); h.stroke(); }   // board tracks
    r.fillStyle = '#c0c0c0'; r.fillRect(0, 0, S, S); speckle(r, S, 600, '#202020', 1, .8);   // glints
  }, { strength: 1.4 });
  MT = {
    snow: pbr('#dfe7f2', { tex: snow.repeat(10, 22), rough: .9 }),
    pine: pbr('#1e4a34', { rough: .8 }), trunk: pbr('#4a3424', { rough: .9 }), rock: pbr('#5a606a', { rough: .85 }), cap: pbr('#ffffff', { rough: .9 }),
    ramp: pbr('#dfeaff', { rough: .5, clear: .4 }), flag: [pbr('#ff3050', { rough: .5 }), pbr('#2a7aff', { rough: .5 })], pole: pbr('#e0e0e0', { rough: .3, metal: .5 }),
    board: pbr('#ff6a20', { rough: .25, clear: 1 }), jacket: pbr('#24c8a0', { rough: .6, sheen: 1 }), pants: pbr('#2a2e48', { rough: .7 }), helmet: pbr('#f0f0f0', { rough: .2, clear: 1 }), goggle: pbr('#ff9a20', { rough: .05, metal: .9, clear: 1 }),
    avalanche: pbr('#f0f4ff', { rough: 1, transparent: true, opacity: .95 }),
  };
  return MT;
}
function makeRider() {
  const m = looks(), g = new Group(), body = new Group(); g.add(body);
  const board = new Mesh(rbox(.32, .05, 1.55, .025), m.board); board.position.y = .03; g.add(board);
  const legs = new Mesh(new CapsuleGeometry(.14, .5, 4, 8), m.pants); legs.position.y = .45; body.add(legs);
  const torso = new Mesh(new CapsuleGeometry(.22, .45, 6, 10), m.jacket); torso.position.y = 1.0; body.add(torso);
  const head = new Mesh(new SphereGeometry(.16, 14, 10), m.helmet); head.position.y = 1.45; body.add(head);
  const gog = new Mesh(rbox(.24, .07, .08, .03), m.goggle); gog.position.set(0, 1.45, .14); body.add(gog);
  for (const s of [-1, 1]) { const arm = new Mesh(new CapsuleGeometry(.07, .45, 4, 6), m.jacket); arm.position.set(s * .32, 1.0, 0); arm.rotation.z = s * .9; body.add(arm); }
  body.rotation.y = Math.PI / 2 * .8;   // stands sideways on the board
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { body, board };
  return g;
}

function make(api) {
  want('motion');
  let v, sunL, tiles, trees, rocks, ramps, flags, rider, snowFx, avFx, aval, built;
  let x, z, y, vy, hd, speed, air, spin, flip, trick, avGap, avSpeed, stumble, score, t, msg, fingers, keys, steer, dist, lastZ, objs;
  const ready = new Ready({ eat: false, text: 'Tap to drop in' });      // the rider and the avalanche wait for the first touch
  let fdt = 1 / 60;
  const mx = new Object3D(), camPos = new Vector3();

  function setup() {
    v = new HDView({ bg: '#8ab8e8', fog: .007, env: .4, sky: '#b8d8ff', ground: '#8090a8', amb: .45, fov: 66 });
    v.exposure = .8; v.bloom = .25;
    sunL = sun('#fff2e0', 2.2, 22, [-.5, .8, -.4]); v.scene.add(sunL, sunL.target); v.onTier(T => sunL.setTier(T));
    const m = looks();
    tiles = [0, 1].map(() => { const g = new PlaneGeometry(WID * 2, TILE, 70, 80); g.rotateX(-Math.PI / 2); const ms = new Mesh(g, m.snow); ms.receiveShadow = true; ms.frustumCulled = false; v.scene.add(ms); return ms; });
    const N = 260;
    trees = { g: new Group(), pine: new InstancedMesh(new ConeGeometry(1, 1, 8), m.pine, N), cap: new InstancedMesh(new ConeGeometry(1, 1, 8), m.cap, N), trunk: new InstancedMesh(new CylinderGeometry(.15, .2, 1, 6), m.trunk, N) };
    rocks = new InstancedMesh(new DodecahedronGeometry(1, 0), m.rock, 60);
    ramps = new InstancedMesh(new BoxGeometry(1, 1, 1), m.ramp, 20);
    flags = [new InstancedMesh(new BoxGeometry(.05, 1, .6), m.flag[0], 30), new InstancedMesh(new BoxGeometry(.05, 1, .6), m.flag[1], 30)];
    for (const o of [trees.pine, trees.cap, trees.trunk, rocks, ramps, ...flags]) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; v.scene.add(o); }
    rider = makeRider(); rider.scale.setScalar(1.25); v.scene.add(rider);
    aval = new Mesh(new SphereGeometry(1, 24, 12), m.avalanche); aval.scale.set(70, 14, 10); v.scene.add(aval);
    snowFx = new Particles(v, { max: 400, additive: false }); avFx = new Particles(v, { max: 300, additive: false });
  }
  function shapeTile(ms, z0) {
    const p = ms.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const lx = p.getX(i), lz = p.getZ(i) + z0 + TILE / 2; p.setY(i, ground(lx, lz)); }
    p.needsUpdate = true; ms.geometry.computeVertexNormals(); ms.geometry.computeBoundingSphere(); ms.geometry.computeBoundingBox(); ms.position.z = z0 + TILE / 2; ms.userData.z0 = z0;   // bounds move with the reshaped tile, else it gets culled (the snow only takes shadows, it casts none: no shadow map to draw again, which v.shadowsDirty() did for every map, kept copies too, at each new tile)
  }
  // things on the slope ahead: trees in clumps, rocks, kickers, gates of flags
  function populate(z0, z1) {
    for (let zz = z0; zz < z1; zz += rnd(5, 9)) {
      const r = Math.random(), xx = rnd(-30, 30);
      for (const sd of [-1, 1]) if (Math.random() < .8) objs.push({ k: 'tree', x: sd * rnd(24, 40), z: zz + rnd(-2, 2), s: rnd(3, 6) });   // forest on both edges
      if (zz < 40) continue;
      if (r < .5) objs.push({ k: 'tree', x: xx, z: zz, s: rnd(2.5, 4.5) });
      else if (r < .65) objs.push({ k: 'rock', x: xx, z: zz, s: rnd(.6, 1.3) });
      else if (r < .76) objs.push({ k: 'ramp', x: rnd(-14, 14), z: zz });
      else if (r < .88) objs.push({ k: 'gate', x: rnd(-16, 16), z: zz, got: false });
    }
  }
  function writeObjs() {
    const c = { tree: 0, rock: 0, ramp: 0, gate: 0 };
    objs = objs.filter(o => o.z > z - 30);
    for (const o of objs) {
      const gy = ground(o.x, o.z);
      if (o.k === 'tree' && c.tree < 260) { const i = c.tree++; mx.rotation.set(0, 0, 0); mx.position.set(o.x, gy + o.s * .2, o.z); mx.scale.set(.25, o.s * .4, .25); mx.updateMatrix(); trees.trunk.setMatrixAt(i, mx.matrix); mx.position.y = gy + o.s * .85; mx.scale.set(o.s * .38, o.s * 1.1, o.s * .38); mx.updateMatrix(); trees.pine.setMatrixAt(i, mx.matrix); mx.position.y = gy + o.s * 1.2; mx.scale.set(o.s * .22, o.s * .45, o.s * .22); mx.updateMatrix(); trees.cap.setMatrixAt(i, mx.matrix); }
      else if (o.k === 'rock' && c.rock < 60) { mx.position.set(o.x, gy + o.s * .4, o.z); mx.rotation.set(o.x, o.z, 0); mx.scale.setScalar(o.s); mx.updateMatrix(); rocks.setMatrixAt(c.rock++, mx.matrix); }
      else if (o.k === 'ramp' && c.ramp < 20) { mx.position.set(o.x, gy + .3, o.z); mx.rotation.set(-.35 - Math.atan(SLOPE), 0, 0); mx.scale.set(4, .5, 4); mx.updateMatrix(); ramps.setMatrixAt(c.ramp++, mx.matrix); }
      else if (o.k === 'gate' && c.gate < 30) { const i = c.gate++; mx.rotation.set(0, 0, 0); for (const s of [0, 1]) { mx.position.set(o.x + (s ? 3 : -3), gy + .9, o.z); mx.scale.set(1, 1.8, 1); mx.updateMatrix(); flags[s].setMatrixAt(i, mx.matrix); } }
    }
    trees.pine.count = trees.cap.count = trees.trunk.count = c.tree; rocks.count = c.rock; ramps.count = c.ramp; flags[0].count = flags[1].count = c.gate;
    for (const o of [trees.pine, trees.cap, trees.trunk, rocks, ramps, ...flags]) o.instanceMatrix.needsUpdate = true;
  }
  function wipe(why) {
    if (stumble > 0) return; stumble = 1.1; speed *= .35; trick = null; spin = flip = 0; haptic('error'); noise(.4, { vol: .1, from: 1200, to: 200 }); msg = { txt: 'WIPEOUT', sub: why, l: 1.2, col: '#ff5a6a' };
    for (let i = 0; i < 40; i++) snowFx.emit({ x, y: y + .5, z, vx: rnd(-3, 3), vy: rnd(1, 4), vz: rnd(-1, 4), life: rnd(.6, 1.2), size: rnd(.3, .7), grow: 1.5, col: [1, 1, 1.05], a: .8, drag: 1.5, grav: 5 });
  }
  function land() {
    air = false; vy = 0;
    const sp = Math.abs(spin) / (Math.PI * 2), fl = Math.abs(flip) / (Math.PI * 2), off = Math.min(Math.abs(sp - Math.round(sp)), .5) + Math.min(Math.abs(fl - Math.round(fl)), .5);
    if (off > .18) { wipe('Landed sideways'); return; }
    const turns = Math.round(sp) + Math.round(fl);
    if (turns > 0) {
      const names = [], degs = Math.round(sp) * 360; if (degs) names.push(degs + (Math.round(sp) > 1 ? ' SPIN' : '')); if (Math.round(fl)) names.push(Math.round(fl) > 1 ? 'DOUBLE FLIP' : 'FLIP');
      const pts = turns * 150 + (Math.round(sp) && Math.round(fl) ? 200 : 0); score += pts; api.score(score);
      speed = Math.min(36, speed + 4 * turns); avGap += 3 * turns;
      msg = { txt: names.join(' + ') || 'NICE', sub: `+${pts}`, l: 1.4, col: '#ffd040' }; haptic('success'); sounds.coin(1.1);
    } else { haptic('medium'); }
    for (let i = 0; i < 20; i++) snowFx.emit({ x: x + rnd(-.5, .5), y: y + .1, z, vx: rnd(-2, 2), vy: rnd(.5, 2.5), vz: rnd(-1, 2), life: .8, size: rnd(.2, .5), grow: 2, col: [1, 1, 1], a: .7, drag: 2, grav: 4 });
    spin = flip = 0; trick = null; rider.rotation.x = 0;
  }
  function update(dt) {
    fdt = dt; if (!ready.update(dt)) { avFxStep(dt); return; }
    t += dt; stumble = Math.max(0, stumble - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    if (t < 1.5) { avFxStep(dt); return; }
    // carve: tilt first, else drag
    let s = steer; const tl = tilt(); if (!fingers.steer && tl) s = clamp(tl.x * 1.4, -1, 1);
    if (keys.has('ArrowLeft') || keys.has('a')) s = -1; if (keys.has('ArrowRight') || keys.has('d')) s = 1;
    if (!air && stumble <= 0) hd += (-s * .95 - hd) * Math.min(1, dt * 4);
    // speed: gravity down the fall line, drag when carving across it
    if (!air) { speed += (9.8 * SLOPE * Math.cos(hd) * .9 - speed * speed * .0032 - Math.abs(hd) * 3.2) * dt; speed = clamp(speed, 4, 40); }
    x += Math.sin(hd) * speed * dt; z += Math.cos(hd) * speed * dt;
    if (Math.abs(x) > 34) { x = Math.sign(x) * 34; hd *= -.3; wipe('Off the piste'); }
    const gy = ground(x, z);
    if (air) { vy -= 20 * dt; y += vy * dt; spin += trick?.spin * dt || 0; flip += trick?.flip * dt || 0; if (y <= gy) { y = gy; land(); } }
    else { const prev = y; y = gy; }
    // objects
    for (const o of objs) {
      if (Math.abs(o.z - z) > 1.6) continue;
      const dx = Math.abs(o.x - x);
      if (o.k === 'tree' && dx < o.s * .25 + .3 && !air) wipe('Tree!');
      else if (o.k === 'rock' && dx < o.s * .9 && (!air || y - gy < o.s)) wipe('Rock!');
      else if (o.k === 'ramp' && dx < 2 && !air && !o.used) { o.used = true; air = true; vy = 6 + speed * .28; haptic('medium'); tone(400, { len: .2, wave: 'triangle', vol: .04, slide: 300 }); msg = msg || { txt: 'AIR! SWIPE FOR A TRICK', l: .9, col: '#fff' }; }
      else if (o.k === 'gate' && dx < 3 && !o.got) { o.got = true; score += 50; api.score(score); sounds.coin(1.3); haptic('light'); avGap += 1.5; }
    }
    // distance points
    const dd = Math.floor(z / 10); if (dd > dist) { score += dd - dist; dist = dd; api.score(score); }
    // the avalanche gains on you when you're slow
    avSpeed = Math.min(30, 13 + t * .22);
    avGap += (speed - avSpeed) * dt; avGap = Math.min(avGap, 60);
    if (avGap < 14 && (t * (20 - avGap) | 0) !== ((t - dt) * (20 - avGap) | 0)) haptic(avGap < 7 ? 'heavy' : 'light');
    if (avGap <= 0) { haptic('error'); noise(1.4, { vol: .18, from: 600, to: 40 }); return api.over(); }
    // recycle terrain tiles + slope furniture
    for (const tl2 of tiles) if (tl2.userData.z0 + TILE < z - 30) { const far = Math.max(...tiles.map(q => q.userData.z0)) + TILE; shapeTile(tl2, far); populate(far, far + TILE); }
    if ((t * 4 | 0) !== ((t - dt) * 4 | 0)) writeObjs();
    // spray
    if (!air && speed > 8) snowFx.emit({ x: x - Math.cos(hd) * .3 * Math.sign(hd || 1), y: y + .1, z: z - .4, vx: -Math.sin(hd) * 2 + rnd(-1, 1), vy: rnd(.5, 2) + Math.abs(hd) * 3, vz: rnd(-1, 1), life: .7, size: rnd(.15, .35) + Math.abs(hd) * .3, grow: 2, col: [1, 1, 1.05], a: .6, drag: 2, grav: 3 });
    avFxStep(dt);
  }
  function avFxStep(dt) {
    const az = z - avGap - 6;
    for (let i = 0; i < 4; i++) avFx.emit({ x: rnd(-34, 34), y: ground(0, az) + rnd(0, 6), z: az + rnd(0, 6), vx: rnd(-1, 1), vy: rnd(1, 4), vz: avSpeed * .9, life: rnd(1, 2), size: rnd(3, 6), grow: 1.5, col: [.95, .97, 1], a: .55, drag: 1, fadeIn: 1 });
    snowFx.update(dt); avFx.update(dt);
  }
  function draw(c) {
    if (!built) self.reset();
    rider.position.set(x, y, z); rider.rotation.set(flip, hd + spin, -hd * .5 * (air ? 0 : 1)); rider.userData.body.rotation.x = stumble > 0 ? Math.sin(stumble * 9) * .5 : 0;
    const az = z - avGap - 6; aval.position.set(0, ground(0, az) + 2, az);
    // camera: behind and above, looking down the slope
    const tx = x - Math.sin(hd) * 3, tz = z - 6.5; camPos.lerp(new Vector3(tx, Math.max(y, ground(tx, tz)) + 3.3, tz), camPos.lengthSq() ? 1 - Math.pow(.85, fdt * 60) : 1);
    v.cam.position.copy(camPos); v.cam.lookAt(x, y + .6, z + 8);
    const fov = 62 + clamp((speed - 15) * .6, 0, 16); if (Math.abs(v.cam.fov - fov) > .2) { v.cam.fov += (fov - v.cam.fov) * (1 - Math.pow(.9, fdt * 60)); v.cam.updateProjectionMatrix(); }
    sunL.follow(x, y, z + 6); v.hurt = avGap < 12 ? (12 - avGap) / 12 * .7 : 0;
    v.render(c, W, H); hud(c);
  }
  function hud(c) {
    const u = Math.min(W, H) / 300; c.save(); c.textBaseline = 'middle';
    c.fillStyle = '#0a1830a0'; c.beginPath(); c.roundRect(8 * u, 8 * u, 96 * u, 34 * u, 10 * u); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `800 ${15 * u}px Rubik, sans-serif`; c.fillText(String(score), 16 * u, 21 * u);
    c.font = `700 ${7 * u}px Rubik, sans-serif`; c.fillStyle = '#a8e0ff'; c.fillText(`${Math.round(speed * 3.6)} KM/H · ${dist * 10} M`, 16 * u, 34 * u);
    // avalanche distance
    const mw = 84 * u, x0 = W - mw - 12 * u, k = clamp(1 - avGap / 40, 0, 1);
    c.fillStyle = '#0a1830a0'; c.beginPath(); c.roundRect(x0 - 6 * u, 8 * u, mw + 12 * u, 34 * u, 10 * u); c.fill();
    c.fillStyle = '#ffffff30'; c.fillRect(x0, 16 * u, mw, 5 * u); c.fillStyle = k > .65 ? '#ff4a5a' : k > .4 ? '#ffb040' : '#8affdc'; c.fillRect(x0, 16 * u, mw * k, 5 * u);
    c.fillStyle = '#fff'; c.font = `700 ${7 * u}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(`AVALANCHE ${Math.max(0, Math.round(avGap))} M`, x0 + mw / 2, 32 * u);
    if (msg) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.col; c.font = `800 ${16 * u}px Rubik, sans-serif`; c.lineWidth = 3 * u; c.strokeStyle = '#0a183080'; c.strokeText(msg.txt, W / 2, H * .3); c.fillText(msg.txt, W / 2, H * .3); if (msg.sub) { c.font = `700 ${9 * u}px Rubik, sans-serif`; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .3 + 16 * u); } c.globalAlpha = 1; }
    if (ready.playing && t < 4) { c.fillStyle = '#0a1830'; c.font = `600 ${8.5 * u}px Rubik, sans-serif`; c.fillText(tilt() ? 'Tilt to carve · kickers launch you · swipe in the air for tricks' : 'Drag to carve · kickers launch you · swipe in the air for tricks', W / 2, H * .62); }
    c.restore();
    ready.draw(c, W, H, { size: 13 * u, y: H * .62, color: '#0a1830', shadow: '#ffffffb0' });
  }
  function trickIn(dir) {
    if (!air || trick) return;
    trick = dir === 'up' || dir === 'down' ? { flip: (dir === 'up' ? -1 : 1) * 9, spin: 0 } : { spin: (dir === 'left' ? 1 : -1) * 11, flip: 0 };
    tone(700, { len: .12, wave: 'triangle', vol: .04, slide: 400 }); haptic('light');
  }
  const self = {
    reset() {
      if (!v) setup();
      x = 0; z = 0; y = ground(0, 0); vy = 0; hd = 0; speed = 12; air = false; spin = flip = 0; trick = null; avGap = 30; avSpeed = 13; stumble = 0; score = 0; t = 0; msg = null; fingers = {}; keys = new Set(); steer = 0; dist = 0; objs = [];
      shapeTile(tiles[0], -30); shapeTile(tiles[1], -30 + TILE); populate(0, TILE * 2 - 30); writeObjs(); camPos.set(0, 0, 0); snowFx.clear(); avFx.clear();
      calibrateTilt(); built = true; v.warmed = false; ready.reset();
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) { snowFx.update(dt); avFx.update(dt); } },
    down(x0, y0, id = 0) { if (ready.waiting) { ready.go(); calibrateTilt(); } const f = { id, ax: x0, ay: y0, x: x0, y: y0 }; fingers[id] = f; if (!fingers.steer) fingers.steer = f; },
    move(x0, y0, p, id = 0) {
      const f = fingers[id]; if (!f || !p) return; const dx = x0 - f.x, dy = y0 - f.y; f.x = x0; f.y = y0;
      if (air && !trick && Math.hypot(x0 - f.ax, y0 - f.ay) > 26) { const ax = x0 - f.ax, ay = y0 - f.ay; trickIn(Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay < 0 ? 'up' : 'down')); f.ax = x0; f.ay = y0; return; }
      if (fingers.steer === f) steer = clamp((x0 - f.ax) / (W * .18), -1, 1);
    },
    up(x0, y0, id = 0) { const f = fingers[id]; delete fingers[id]; if (fingers.steer === f) { fingers.steer = Object.values(fingers).find(q => q.id !== undefined && q !== f) || null; steer = 0; } },
    key(k, d) { if (d) { ready.go(); keys.add(k); } else keys.delete(k); if (d && air) { if (k === 'ArrowUp' || k === 'w') trickIn('up'); if (k === 'q') trickIn('left'); if (k === 'e') trickIn('right'); } },
  };
  return self;
}

export default {
  id: 'frost-line',
  title: 'Frost Line',
  tag: 'Next Gen · Sports',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 600, reward: 25,
  hint: 'Snowboard down a mountain ahead of an avalanche. Tilt the phone (or drag) to carve round trees and rocks: straight lines are fastest. Hit a kicker to launch and swipe in the air for a trick, sideways to spin, up or down to flip. Land straight for points and speed. Too slow and the snow catches you.',
  traits: ['theme:snow'],
  make,
};
