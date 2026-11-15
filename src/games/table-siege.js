import gs from '../gamescroll.js';
const { sounds, noise, tone } = gs.sound;
const { haptic, want } = gs.device;
const { clamp, rnd } = gs.util;
const { Particles, pbr, rbox, surface, speckle, THREE } = gs.hd;
const { ARView, arNote, FLOOR } = gs.ar;
const { approach } = gs.juice;
const { Group, Mesh, Vector3, Vector2, Raycaster, Plane, CylinderGeometry, ConeGeometry, SphereGeometry, CapsuleGeometry, BoxGeometry, CircleGeometry, PlaneGeometry, IcosahedronGeometry, DoubleSide } = THREE;

// Table Siege: a tiny castle stands on your real table (or floor) and little toy soldiers march on it
// from every side. Tap a soldier (or the ground near it) to lob a boulder from the castle's catapult.
// Shield bearers take two hits and battering rams three. Some come from behind the castle: walk round
// it to see them (or drag to spin the table when you can't walk round). Ten breaches and it falls.
let W = 300, H = 460;
const RING = .55, CASTLE_HP = 10;

let MT = null;
function looks() {
  if (MT) return MT;
  const stone = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#b8b0a0'; col.fillRect(0, 0, S, S); h.fillStyle = '#909090'; h.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 32) for (let x = (y / 32 % 2) * 32; x < S + 32; x += 64) { const v = 160 + Math.random() * 40 | 0; col.fillStyle = `rgb(${v},${v - 6},${v - 18})`; col.fillRect(x - 30, y + 2, 60, 28); h.fillStyle = '#d0d0d0'; h.fillRect(x - 29, y + 3, 58, 26); }
    speckle(col, S, 900, '#6a6050', 1.5, .3);
  }, { strength: 3 });
  const grass = surface(128, ({ col, size: S }) => { col.fillStyle = '#5a9a40'; col.fillRect(0, 0, S, S); speckle(col, S, 1500, '#3a7028', 1.2, .5); speckle(col, S, 600, '#8ac860', 1, .4); });
  MT = {
    stone: pbr('#ffffff', { tex: stone.repeat(2, 1), rough: .85 }), roof: pbr('#3a5ab0', { rough: .4, clear: .5 }), grass: pbr('#ffffff', { tex: grass.repeat(3, 3), rough: .9 }),
    wood: pbr('#8a5a30', { rough: .7 }), flag: pbr('#ffd040', { rough: .5, side: DoubleSide }), boulder: pbr('#6a6560', { rough: .9 }), gate: pbr('#4a3020', { rough: .8 }),
    red: pbr('#d03030', { rough: .45, clear: .6 }), helm: pbr('#c0c4cc', { rough: .25, metal: 1 }), skin: pbr('#f0c8a0', { rough: .6 }), shield: pbr('#2a6ad0', { rough: .4, metal: .3 }), ram: pbr('#6a4428', { rough: .8 }),
    ring: pbr('#8affdc', { glow: 1.6, transparent: true, opacity: .5 }),
  };
  return MT;
}
const M = (geo, mat, x = 0, y = 0, z = 0, par) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; par?.add(m); return m; };
function makeCastle() {
  const m = looks(), g = new Group();
  M(new CylinderGeometry(RING + .12, RING + .14, .02, 48), m.grass, 0, .01, 0, g);
  const r = .14;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * r, z = Math.sin(a) * r; M(new CylinderGeometry(.04, .045, .2, 14), m.stone, x, .12, z, g); M(new ConeGeometry(.055, .08, 14), m.roof, x, .26, z, g); }
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, w = M(rbox(.2, .12, .03, .008), m.stone, Math.cos(a) * r * .72, .08, Math.sin(a) * r * .72, g); w.rotation.y = -a + Math.PI / 2; }
  M(rbox(.12, .2, .12, .01), m.stone, 0, .12, 0, g); M(new ConeGeometry(.09, .1, 4), m.roof, 0, .27, 0, g).rotation.y = Math.PI / 4;
  M(new CylinderGeometry(.003, .003, .12, 4), m.wood, 0, .38, 0, g); const fl = M(new PlaneGeometry(.06, .035), m.flag, .03, .42, 0, g); fl.castShadow = false;
  M(rbox(.05, .06, .012, .004), m.gate, 0, .05, .105, g);
  // catapult on the keep
  const cat = new Group(); cat.position.set(0, .23, 0); g.add(cat); const arm = new Group(); cat.add(arm); M(rbox(.012, .012, .1, .003), m.wood, 0, .01, -.03, arm); M(new SphereGeometry(.012, 8, 6), m.boulder, 0, .02, -.08, arm);
  g.userData = { flag: fl, arm };
  return g;
}
function makeTrooper(kind) {
  const m = looks(), g = new Group();
  if (kind === 'ram') {
    M(new CylinderGeometry(.012, .014, .1, 10), m.ram, 0, .025, 0, g).rotation.x = Math.PI / 2; M(rbox(.05, .03, .08, .008), m.wood, 0, .045, -.01, g);
    for (const s of [-1, 1]) for (const z of [-.03, .02]) M(new CylinderGeometry(.009, .009, .006, 10), m.wood, s * .028, .01, z, g).rotation.z = Math.PI / 2;
    for (const z of [-.04, 0]) { M(new CapsuleGeometry(.007, .014, 3, 6), m.red, .03, .04, z, g); M(new SphereGeometry(.007, 8, 6), m.helm, .03, .06, z, g); }
  } else {
    M(new CapsuleGeometry(.008, .016, 3, 8), m.red, 0, .022, 0, g); M(new SphereGeometry(.007, 8, 6), m.skin, 0, .042, 0, g); M(new SphereGeometry(.0075, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.helm, 0, .044, 0, g);
    M(new CylinderGeometry(.0012, .0012, .05, 4), m.wood, .011, .03, .004, g);
    if (kind === 'shield') M(rbox(.022, .028, .004, .002), m.shield, 0, .024, .012, g);
  }
  return g;
}

function make(api) {
  want('motion');
  let v, board, castle, troops, rocks, dust, fire, built;
  let state, scale, base, wave, toSpawn, spawnT, hp, score, t, msg, tap, waveT, kills, spinY;
  const tmp = new Vector3(), ray = new Raycaster(), v2 = new Vector2(), plane = new Plane(new Vector3(0, 1, 0), 0);

  function setup() {
    v = new ARView();
    board = new Group(); v.scene.add(board); castle = makeCastle(); board.add(castle);
    const ring = new Mesh(new CircleGeometry(RING + .12, 48), looks().ring); ring.rotation.x = -Math.PI / 2; ring.position.y = .002; board.add(ring); board.userData.ring = ring;
    board.visible = false;
    dust = new Particles(v, { max: 300, additive: false }); fire = new Particles(v, { max: 200, additive: true });
  }
  function say(txt, col = '#fff', l = 1.2, sub) { msg = { txt, col, l, sub }; }
  async function placeAt(x, y) {
    let p = null, onFloor = true;
    if (v.mode === 'world' && v.hit) { const h = await v.hit(x, y); if (h) { p = h.p; onFloor = Math.abs(p.y - FLOOR) < .25; } }
    if (!p) { const yaw = v.heading(), e = v.eyePos; p = new Vector3(e.x - Math.sin(yaw) * 2, FLOOR, e.z - Math.cos(yaw) * 2); }
    // a castle on the floor is far away: make it bigger so the soldiers are still easy to tap
    scale = onFloor ? 1.9 : 1; base = p.clone(); board.position.copy(p); board.scale.setScalar(scale); board.visible = true; board.userData.ring.visible = false;
    spinY = 0; board.rotation.y = 0; state = 'play'; waveT = 1.5; haptic('success'); sounds.select(); say('DEFEND THE CASTLE!', '#ffd040', 1.6, onFloor ? 'Tap soldiers to fire' : 'On your table! Tap soldiers to fire');
  }
  function startWave() { wave++; toSpawn = 4 + wave * 2; spawnT = 0; say(`WAVE ${wave}`, '#fff', 1.2); }
  function spawn() {
    const r = Math.random(), kind = wave >= 3 && r < .15 ? 'ram' : wave >= 2 && r < .45 ? 'shield' : 'foot';
    const g = makeTrooper(kind), a = rnd(0, Math.PI * 2); g.scale.setScalar(1.6); board.add(g);
    troops.push({ g, kind, a, r: RING, hp: kind === 'ram' ? 3 : kind === 'shield' ? 2 : 1, sp: (kind === 'ram' ? .022 : .035) * (1 + wave * .06), dmg: kind === 'ram' ? 3 : 1, ph: rnd(0, 6) });
  }
  // a screen tap -> a spot on the board (local units), then a boulder flies there
  function fireAt(x, y) {
    ray.setFromCamera(v2.set(x / W * 2 - 1, 1 - y / H * 2), v.cam);
    plane.constant = -base.y; const hit = ray.ray.intersectPlane(plane, tmp); if (!hit) return;
    const local = board.worldToLocal(hit.clone()); if (Math.hypot(local.x, local.z) > RING + .25) return;
    const rock = M(new IcosahedronGeometry(.011, 0), looks().boulder); board.add(rock);
    rocks.push({ m: rock, from: new Vector3(0, .25, 0), to: new Vector3(local.x, 0, local.z), t: 0, T: .45 + Math.hypot(local.x, local.z) * .4 });
    castle.userData.arm.rotation.x = -1.2; haptic('light'); tone(260, { len: .12, wave: 'triangle', vol: .04, slide: -80 });
  }
  function land(to) {
    const R = .055; let hit = 0;
    for (const s of troops) { const x = Math.cos(s.a) * s.r, z = Math.sin(s.a) * s.r; if (Math.hypot(x - to.x, z - to.z) < R + (s.kind === 'ram' ? .03 : .01)) { s.hp--; hit++; s.flash = .2; if (s.hp <= 0) { kills++; score += s.kind === 'ram' ? 40 : s.kind === 'shield' ? 20 : 10; } } }
    const wp = board.localToWorld(to.clone());
    for (let i = 0; i < 18; i++) dust.emit({ x: wp.x, y: wp.y + .01 * scale, z: wp.z, vx: rnd(-.3, .3) * scale, vy: rnd(.1, .4) * scale, vz: rnd(-.3, .3) * scale, life: .7, size: rnd(.01, .025) * scale, grow: 2, col: [.6, .55, .45], a: .6, drag: 2, grav: 1 * scale });
    noise(.15, { vol: .07, from: 1800, to: 300 }); haptic(hit ? 'medium' : 'tick');
    if (hit) { api.score(score); sounds.hit(1.3); }
    for (const s of troops.filter(q => q.hp <= 0)) { board.remove(s.g); for (let i = 0; i < 10; i++) { const p = board.localToWorld(new Vector3(Math.cos(s.a) * s.r, .02, Math.sin(s.a) * s.r)); fire.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-.2, .2) * scale, vy: rnd(.1, .4) * scale, vz: rnd(-.2, .2) * scale, life: .4, size: .012 * scale, col: [3, 2, .6], drag: 2, grav: 1 }); } }
    troops = troops.filter(q => q.hp > 0);
  }
  function update(dt) {
    if (!v) return; v.live(); if (v.calibrating) return;
    t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    if (state === 'place') { if (v.mode !== 'world' && t > 1.2) placeAt(W / 2, H / 2); fx(dt); return; }
    if (waveT > 0) { waveT -= dt; if (waveT <= 0) startWave(); }
    if (toSpawn > 0) { spawnT -= dt; if (spawnT <= 0) { spawn(); toSpawn--; spawnT = Math.max(.5, 1.6 - wave * .1); } }
    for (const s of troops) {
      s.r -= s.sp * dt; s.ph += dt * 12; s.flash = Math.max(0, (s.flash || 0) - dt);
      s.g.position.set(Math.cos(s.a) * s.r, s.kind === 'ram' ? 0 : Math.abs(Math.sin(s.ph)) * .004, Math.sin(s.a) * s.r); s.g.rotation.y = -s.a - Math.PI / 2;
      s.g.visible = !(s.flash > 0 && (t * 30 | 0) % 2);
      if (s.r < .17) { s.hp = 0; hp -= s.dmg; haptic('heavy'); sounds.hurt(); say(s.kind === 'ram' ? 'RAMMED THE GATE!' : 'BREACH!', '#ff5a4a', .9); board.remove(s.g); for (let i = 0; i < 20; i++) { const p = board.localToWorld(new Vector3(Math.cos(s.a) * .17, .06, Math.sin(s.a) * .17)); fire.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(-.3, .3) * scale, vy: rnd(.2, .6) * scale, vz: rnd(-.3, .3) * scale, life: .6, size: .02 * scale, col: [4, 1.6, .4], drag: 2, grav: 1 }); } }
    }
    troops = troops.filter(q => q.hp > 0);
    for (const r of rocks) { r.t += dt; const k = Math.min(1, r.t / r.T); r.m.position.lerpVectors(r.from, r.to, k); r.m.position.y = r.from.y * (1 - k) + Math.sin(k * Math.PI) * .25 + .012; if (k >= 1) { land(r.to); board.remove(r.m); r.done = true; } }
    rocks = rocks.filter(r => !r.done);
    castle.userData.arm.rotation.x = approach(castle.userData.arm.rotation.x, 0, 4, dt); castle.userData.flag.rotation.y = Math.sin(t * 4) * .3;
    if (hp <= 0) { v.off(); sounds.lose(); return api.over(); }
    if (toSpawn === 0 && !troops.length && waveT <= 0) { score += 50 * wave; api.score(score); say(`WAVE ${wave} HELD!`, '#8affdc', 1.4, `+${50 * wave}`); haptic('success'); waveT = 2.2; }
    fx(dt);
  }
  function fx(dt) { dust.update(dt); fire.update(dt); }
  function draw(c) {
    if (!v) { setup(); self.reset(); }
    v.look(1 / 60);
    if (state === 'place') { board.visible = true; board.userData.ring.visible = true; const yaw = v.heading(), e = v.eyePos; board.position.set(e.x - Math.sin(yaw) * 2, FLOOR, e.z - Math.cos(yaw) * 2); board.scale.setScalar(1.9); }
    board.rotation.y = spinY;
    v.draw(c, W, H);
    // troops hidden round the back: arrows for those not in view
    if (state === 'play') v.pointers(c, W, H, troops.slice(0, 6).map(s => ({ p: board.localToWorld(new Vector3(Math.cos(s.a) * s.r, .03, Math.sin(s.a) * s.r)), col: '#ff6a5a' })));
    c.save(); c.textBaseline = 'middle';
    c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(10, 10, 132, 36, 10); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '800 16px Rubik, sans-serif'; c.fillText(String(score), 20, 24); c.font = '600 9px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText(`WAVE ${Math.max(1, wave)} · ${kills} DOWN`, 20, 38);
    for (let i = 0; i < CASTLE_HP; i++) { c.fillStyle = i < hp ? '#ffd040' : '#ffffff30'; c.fillRect(W - 16 - (CASTLE_HP - i) * 9, 18, 7, 12); }
    c.fillStyle = '#fff'; c.font = '600 9px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText('CASTLE', W - 16, 40);
    c.textAlign = 'center';
    if (state === 'place') { c.fillStyle = '#04110ecc'; c.beginPath(); c.roundRect(W / 2 - 130, H - 120, 260, 44, 12); c.fill(); c.fillStyle = '#fff'; c.font = '700 13px Rubik, sans-serif'; c.fillText(v.mode === 'world' ? 'Tap a table or the floor to build' : 'Building your castle...', W / 2, H - 98); }
    if (msg) { c.globalAlpha = Math.min(1, msg.l * 2); c.lineWidth = 4; c.strokeStyle = '#000a'; c.font = '800 22px Rubik, sans-serif'; c.strokeText(msg.txt, W / 2, H * .22); c.fillStyle = msg.col; c.fillText(msg.txt, W / 2, H * .22); if (msg.sub) { c.font = '600 11px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .22 + 20); } c.globalAlpha = 1; }
    if (state === 'play' && t < 9 && v.mode !== 'world') { c.fillStyle = '#ffffffd0'; c.font = '600 11px Rubik, sans-serif'; c.fillText('Drag sideways to spin the castle and see behind it', W / 2, H - 56); }
    c.restore();
    arNote(c, v, W, H);
  }
  const self = {
    reset() {
      v?.off(); v?.recenter();
      for (const s of troops || []) board.remove(s.g); for (const r of rocks || []) board.remove(r.m);
      troops = []; rocks = []; wave = 0; toSpawn = 0; spawnT = 0; hp = CASTLE_HP; score = 0; t = 0; msg = null; tap = null; waveT = 0; kills = 0; spinY = 0; state = 'place'; scale = 1.9; base = new Vector3(0, FLOOR, -1.4);
      if (v) { dust.clear(); fire.clear(); if (!v.sensor) v.pitch = -.5; }   // no gyro: start looking down at the floor
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) fx(dt); },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; tap = { x0: x, y0: y, x, y, id, moved: 0 }; },
    move(x, y, pressed, id) {
      if (v?.input?.('move', x, y, id, pressed)) return; if (!tap || tap.id !== id || !pressed) return;
      const dx = x - tap.x; tap.moved = Math.max(tap.moved, Math.hypot(x - tap.x0, y - tap.y0)); tap.x = x; tap.y = y;
      if (tap.moved > 12) { if (state === 'play' && v.mode !== 'world') spinY += dx * .012; else if (!v.sensor) v.drag(dx, 0); }
    },
    up(x, y, id) {
      if (v?.input?.('up', x, y, id)) return; if (!tap || tap.id !== id) return; const quick = tap.moved < 12; tap = null; if (!quick) return;
      if (state === 'place') placeAt(x, y); else fireAt(x, y);
    },
  };
  return self;
}

export default {
  id: 'table-siege',
  title: 'Table Siege',
  tag: 'AR · Strategy',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 400, reward: 20,
  hint: 'Build a tiny castle on your real table or floor, then defend it from toy soldiers marching in from every side. Tap a soldier to lob a boulder at it: shields take two hits, rams three. Walk round the castle to spot the ones behind it (or drag to spin it). Ten breaches and it falls.',
  traits: ['theme:castle'],
  make,
};
