// Lighthouse Watch: a stormy night, and fishing boats are heading home across a sea full of rocks they
// can't see. Drag to swing the lighthouse beam. Rocks it sweeps over light up with foam for a few seconds,
// and boats steer round any rock they can see. Every boat home scores; three wrecks and the harbour shuts.
import gs from '../gamescroll.js';
const { Ready } = gs.rounds;
const { sounds, noise, bed } = gs.sound;
const { haptic } = gs.device;
const { Juice } = gs.juice;
const { HDView, Particles, pbr, rbox, sun, THREE } = gs.hd;
const { rnd } = gs.util;

let W = 300, H = 300;
const LAMP = new THREE.Vector3(-5, 7, 2), HARBOUR = new THREE.Vector3(2.5, 0, 1);
const SEEN = 3.5;   // seconds a rock stays lit after the beam passes

let v, beam, beamLight, beamMat, sea, rocks, boatPool, spray, moon, ray, plane;
function setup() {
  v = new HDView({ bg: '#05080f', fog: .03, env: .12, amb: .08, fov: 60 });
  moon = sun('#7088c0', .35, 30); v.scene.add(moon, moon.target); v.onTier(T => moon.setTier(T));
  sea = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), pbr('#0a1a2c', { rough: .12, metal: .2 }));
  sea.rotation.x = -Math.PI / 2; sea.receiveShadow = true; v.scene.add(sea);
  // the lighthouse on its rock, and the harbour wall
  const rockMat = pbr('#3c3a3e', { rough: .9 });
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2), rockMat); base.position.set(LAMP.x, -.6, LAMP.z); base.scale.y = .6; v.scene.add(base);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(.7, 1.1, 6.4, 20), pbr('#e8e4dc', { rough: .5 })); tower.position.set(LAMP.x, 3.4, LAMP.z); tower.castShadow = true; v.scene.add(tower);
  for (let i = 0; i < 2; i++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(.82 - i * .1, .92 - i * .1, .9, 20), pbr('#c03030', { rough: .5 })); band.position.set(LAMP.x, 1.6 + i * 2.6, LAMP.z); v.scene.add(band); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 12), pbr('#fff0c0', { glow: 6 })); lamp.position.copy(LAMP); v.scene.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(.9, .8, 20), pbr('#202428', { rough: .4, metal: .6 })); cap.position.set(LAMP.x, LAMP.y + .8, LAMP.z); v.scene.add(cap);
  const wall = new THREE.Mesh(rbox(9, 1, 1.4, .15), pbr('#4a4a50', { rough: .8 })); wall.position.set(9, .2, 1.5); v.scene.add(wall);
  const quay = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 8), pbr('#80ff90', { glow: 4 })); quay.position.set(HARBOUR.x + 1.6, 1.1, HARBOUR.z + .6); v.scene.add(quay);
  // the beam: a soft cone you can see in the rain, and a real spotlight on the water
  const L = 40, cone = new THREE.ConeGeometry(5, L, 24, 1, true); cone.translate(0, -L / 2, 0); cone.rotateX(Math.PI / 2);
  beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .45, .3), transparent: true, opacity: .18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  beam = new THREE.Mesh(cone, beamMat); beam.position.copy(LAMP); beam.rotation.order = 'YXZ'; v.scene.add(beam);
  beamLight = new THREE.SpotLight('#fff2d0', 900, 60, .16, .4, 1.5); beamLight.position.copy(LAMP); v.scene.add(beamLight, beamLight.target);
  // rocks: a pool, placed each round
  rocks = [];
  const rockGeo = new THREE.DodecahedronGeometry(1), ringGeo = new THREE.RingGeometry(1.1, 1.6, 24).rotateX(-Math.PI / 2);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(rockGeo, rockMat); m.castShadow = true;
    const foam = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#d8f0ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    v.scene.add(m, foam); rocks.push({ m, foam, x: 0, z: 0, s: 1, lit: 0, on: false });
  }
  boatPool = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(rbox(.9, .4, 2, .12), pbr(['#8a4a28', '#2a5a8a', '#3a7a4a', '#8a2a3a'][i % 4], { rough: .6 })); hull.position.y = .15; hull.castShadow = true;
    const cab = new THREE.Mesh(rbox(.6, .5, .6, .08), pbr('#e0e0d8', { rough: .5 })); cab.position.set(0, .6, .3);
    const lan = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), pbr('#ffcc70', { glow: 8 })); lan.position.set(0, 1, .3);
    g.add(hull, cab, lan); g.visible = false; v.scene.add(g);
    boatPool.push(g);
  }
  spray = new Particles(v, { max: 400, additive: true });
  ray = new THREE.Raycaster(); plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
}

function make(api) {
  const ready = new Ready({ eat: false });   // the round starts on the first touch
  const fx = new Juice();
  let boats, yaw, want, score, wrecks, t, spawnT, ended, rain, storm;

  function placeRocks() {
    const n = 10;
    rocks.forEach(r => { r.on = false; r.m.visible = r.foam.visible = false; });
    for (let i = 0; i < n; i++) {
      const r = rocks[i]; let tries = 0;
      do { r.x = rnd(-15, 15); r.z = rnd(-32, -7); tries++; } while (tries < 30 && rocks.slice(0, i).some(o => Math.hypot(o.x - r.x, o.z - r.z) < 4.5));
      addRock(r);
    }
  }
  function addRock(r) { r.s = rnd(.7, 1.2); r.on = true; r.lit = 0; r.m.visible = r.foam.visible = true; r.m.position.set(r.x, -.2, r.z); r.m.scale.set(r.s, r.s * .7, r.s); r.m.rotation.y = Math.random() * 6; r.foam.position.set(r.x, .03, r.z); r.foam.scale.setScalar(r.s); }
  function spawnBoat() {
    const g = boatPool.find(b => !b.visible); if (!g) return;
    g.visible = true; g.position.set(rnd(-14, 14), 0, -31); g.rotation.set(0, 0, 0);
    boats.push({ g, vx: 0, vz: 1, sink: 0, speed: rnd(2.2, 2.8) + Math.min(1, t / 120) });
  }
  function aimAt(x, y) {
    ray.setFromCamera(new THREE.Vector2(x / W * 2 - 1, -(y / H) * 2 + 1), v.cam);
    const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(plane, p)) return;
    want = Math.atan2(-(p.x - LAMP.x), -(p.z - LAMP.z));
  }

  return {
    reset() {
      if (!v) setup();
      for (const b of boatPool) b.visible = false;
      rain?.stop(); rain = null; boats = []; yaw = .3; want = .3; score = 0; wrecks = 0; t = 0; spawnT = 1; ready.reset(); ended = false; storm = 0;
      placeRocks(); spray.clear(); fx.clear();
    },
    resize(w, h) { W = w; H = h; },
    pause() { rain?.stop(); rain = null; },
    update(dt) {
      fx.update(dt); t += dt;
      // the beam follows your finger, with a little lag like a heavy lamp
      yaw += Math.max(-dt * 3, Math.min(dt * 3, want - yaw));
      const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      beam.rotation.set(-.1, yaw, 0);
      beamLight.target.position.set(LAMP.x + dx * 30, 0, LAMP.z + dz * 30);
      for (const r of rocks) {
        if (!r.on) continue;
        const rx = r.x - LAMP.x, rz = r.z - LAMP.z, d = Math.hypot(rx, rz), cos = (rx * dx + rz * dz) / d;
        if (cos > Math.cos(.16 + 1.2 / d)) { if (r.lit < .5 && ready.playing) sounds.click(); r.lit = SEEN; }
        r.lit = Math.max(0, r.lit - dt);
        r.foam.material.opacity = Math.min(1, r.lit / 1.2) * (.6 + .3 * Math.sin(t * 6 + r.x));
      }
      if (!ready.playing) return;
      if (!rain) rain = bed({ vol: .03, from: 2400, filter: 'bandpass' });
      // more boats, and a new rock every so often
      spawnT -= dt;
      if (spawnT <= 0) { spawnT = Math.max(2.6, 6.5 - t / 25); spawnBoat(); }
      storm += dt; if (storm > 20) { storm = 0; const r = rocks.find(k => !k.on); if (r) { r.x = rnd(-15, 15); r.z = rnd(-30, -8); addRock(r); } }
      for (const b of [...boats]) {
        const p = b.g.position;
        if (b.sink) {
          b.sink += dt; p.y = -b.sink * .8; b.g.rotation.z = b.sink * .6;
          if (b.sink > 2) { b.g.visible = false; boats.splice(boats.indexOf(b), 1); }
          continue;
        }
        // head for the harbour, but steer round any rock the boat can see
        let tx = HARBOUR.x - p.x, tz = HARBOUR.z - p.z; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
        for (const r of rocks) {
          if (!r.on || r.lit <= 0) continue;
          const rx = r.x - p.x, rz = r.z - p.z, ahead = rx * b.vx + rz * b.vz, side = rx * -b.vz + rz * b.vx;
          if (ahead > 0 && ahead < 6 && Math.abs(side) < 2.2 + r.s) { const push = (2.6 + r.s - Math.abs(side)) / 2; tx += -b.vz * -Math.sign(side || 1) * push * 2; tz += b.vx * -Math.sign(side || 1) * push * 2; }
        }
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const k = 1 - Math.exp(-2.5 * dt); b.vx += (tx - b.vx) * k; b.vz += (tz - b.vz) * k; const bl = Math.hypot(b.vx, b.vz) || 1; b.vx /= bl; b.vz /= bl;
        p.x += b.vx * b.speed * dt; p.z += b.vz * b.speed * dt; p.y = Math.sin(t * 2 + p.x) * .06;
        b.g.rotation.y = Math.atan2(-b.vx, -b.vz) + Math.PI;
        // rocks the boat didn't see
        const hit = rocks.find(r => r.on && Math.hypot(r.x - p.x, r.z - p.z) < .7 + r.s * .9);
        if (hit) {
          b.sink = .001; wrecks++; sounds.boom(.7); haptic('error'); fx.shake(4).flash('#ff6040', .25);
          for (let i = 0; i < 40; i++) spray.emit({ x: p.x, y: .3, z: p.z, vx: rnd(-3, 3), vy: rnd(2, 5), vz: rnd(-3, 3), life: 1, size: .14, col: [1.2, 1.4, 1.6], drag: 1, grav: 8, floor: 0 });
          const [sx, sy] = v.toScreen(p.x, 1, p.z); fx.pop(sx, sy - 10, 'WRECKED', { color: '#ff8070' });
          if (wrecks >= 3 && !ended) { ended = true; sounds.lose(); rain?.stop(); rain = null; api.over(); }
        } else if (Math.hypot(HARBOUR.x - p.x, HARBOUR.z - p.z) < 1.4) {
          score++; api.score(score); sounds.coin(1 + score * .02); haptic('success');
          const [sx, sy] = v.toScreen(p.x, 1.5, p.z); fx.pop(sx, sy, 'HOME +1', { color: '#90ffa0' });
          b.g.visible = false; boats.splice(boats.indexOf(b), 1);
        }
      }
      spray.update(dt);
      if (Math.random() < dt * .08) { noise(.8, { vol: .05, from: 300, to: 60 }); fx.flash('#c0d0ff', .12); }
    },
    draw(c) {
      v.cam.position.set(2, 15, 11); v.cam.lookAt(0, 0, -13);
      moon.follow(0, 0, -12);
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      // rain streaks on the glass
      c.strokeStyle = '#a0b8e030'; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < 40; i++) { const x = (i * 53 + t * 90) % W, y = (i * 97 + t * 420) % H; c.moveTo(x, y); c.lineTo(x - 3, y + 10); } c.stroke();
      c.textAlign = 'left'; c.font = '700 12px Rubik, sans-serif';
      for (let i = 0; i < 3; i++) { c.fillStyle = i < 3 - wrecks ? '#ffd070' : '#ffffff25'; c.beginPath(); c.arc(16 + i * 16, 18, 5, 0, 7); c.fill(); }
      c.textAlign = 'center';
      if (!ready.playing) { c.fillStyle = '#000000b0'; c.fillRect(0, H * .62, W, 52); c.fillStyle = '#fff'; c.font = '700 13px Rubik, sans-serif'; c.fillText('Drag to swing the beam', W / 2, H * .62 + 20); c.font = '500 11px Rubik, sans-serif'; c.fillStyle = '#ffe9b0'; c.fillText('Boats steer round rocks you light up', W / 2, H * .62 + 38); }
    },
    down(x, y) { ready.go(); aimAt(x, y); haptic('tick'); },
    move(x, y, pressed) { if (pressed) aimAt(x, y); },
    key(k, d) { if (!d) return; ready.go(); if (k === 'ArrowLeft') want += .25; if (k === 'ArrowRight') want -= .25; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'lighthouse-watch',
  title: 'Lighthouse Watch',
  tag: 'Next Gen · Strategy',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 12,
  hint: 'Drag to swing the lighthouse beam across the dark sea. Rocks you light up glow with foam, and boats steer round the ones they can see. Three wrecks and it is over.',
  make,
};
