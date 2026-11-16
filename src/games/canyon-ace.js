import gs from '../gamescroll.js';
const { sounds, noise, tone } = gs.sound;
const { haptic, want, tilt, calibrateTilt } = gs.device;
const { clamp, rnd } = gs.util;
const { Ready } = gs.rounds;
const { HDView, Particles, pbr, rbox, surface, speckle, sun, THREE } = gs.hd;
const { approach } = gs.juice;
const { Stick } = gs.controls;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, BufferGeometry, BufferAttribute, ConeGeometry, CylinderGeometry, TorusGeometry, BoxGeometry, SphereGeometry, PlaneGeometry, MeshBasicMaterial, AdditiveBlending, Color } = THREE;

// Canyon Ace: fly a jet low through a winding desert canyon. Tilt the phone to fly (or drag like a
// stick): bank left and right, nose up and down. The closer you skim the walls and the floor, the
// faster your points pile up (watch the multiplier), and gold rings give a burst of speed and a
// bonus. Clip the rock and you lose a shield; three and the jet is done.
let W = 300, H = 300;
const SEG = 4, NS = 900, LEN = SEG * NS, CEIL = 46;
const cx = z => Math.sin(z * .006) * 40 + Math.sin(z * .017 + 1) * 16 + Math.sin(z * .041) * 5;
const half = z => 17 + Math.sin(z * .009 + 2) * 6 + Math.sin(z * .027) * 3 - Math.min(5, z / 900);
const floorY = z => Math.sin(z * .013) * 3 + Math.sin(z * .05 + 1) * 1.2;

let MT = null;
function looks() {
  if (MT) return MT;
  const strata = surface(512, ({ col, h, r, size: S }) => {
    for (let y = 0; y < S; y += 4) { const k = Math.sin(y * .09) * .5 + Math.sin(y * .23) * .3 + Math.random() * .2; col.fillStyle = `hsl(${18 + k * 10}, ${50 + k * 15}%, ${40 + k * 12}%)`; col.fillRect(0, y, S, 4); h.fillStyle = `rgb(${128 + k * 90},${128 + k * 90},${128 + k * 90})`; h.fillRect(0, y, S, 4); }
    speckle(col, S, 3000, '#5a2a14', 2, .35); speckle(col, S, 1500, '#e8b080', 1.5, .25);
    for (let i = 0; i < 40; i++) { h.strokeStyle = '#000'; h.lineWidth = rnd(1, 3); h.beginPath(); const x = rnd(0, S); h.moveTo(x, 0); h.lineTo(x + rnd(-30, 30), S); h.stroke(); }   // cracks
    r.fillStyle = '#d0d0d0'; r.fillRect(0, 0, S, S);
  }, { strength: 3 });
  const sand = surface(256, ({ col, h, size: S }) => { col.fillStyle = '#c8865a'; col.fillRect(0, 0, S, S); speckle(col, S, 2500, '#8a5030', 1.5, .35); for (let y = 0; y < S; y += 9) { h.fillStyle = '#ffffff40'; h.fillRect(0, y + Math.sin(y) * 3, S, 3); } });
  MT = {
    wall: pbr('#ffffff', { tex: strata, rough: .95, side: THREE.DoubleSide }), floor: pbr('#ffffff', { tex: sand, rough: 1, side: THREE.DoubleSide }),
    body: pbr('#c8ccd4', { rough: .3, metal: .7, clear: .6 }), dark: pbr('#30343c', { rough: .35, metal: .8 }), canopy: pbr('#1a2a3a', { rough: .05, metal: .9, clear: 1 }), stripe: pbr('#ff5a20', { rough: .3, clear: 1 }),
    ring: pbr('#ffcc30', { glow: 2.6, rough: .2, metal: .6 }), flame: new MeshBasicMaterial({ color: new Color(4, 2.2, .9), transparent: true, opacity: .85, depthWrite: false, blending: AdditiveBlending }),
  };
  return MT;
}
function makeJet() {
  const m = looks(), g = new Group();
  const fus = new Mesh(new CylinderGeometry(.42, .5, 5, 16), m.body); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new Mesh(new ConeGeometry(.42, 2.2, 16), m.body); nose.rotation.x = Math.PI / 2; nose.position.z = 3.6; g.add(nose);
  const can = new Mesh(new SphereGeometry(.4, 16, 10), m.canopy); can.scale.set(.8, .7, 2); can.position.set(0, .4, 1.4); g.add(can);
  const wing = new Mesh(rbox(6.5, .12, 2, .05), m.body); wing.position.set(0, -.05, -.3); g.add(wing);
  for (const s of [-1, 1]) { const tip = new Mesh(rbox(.5, .14, 1.4, .05), m.stripe); tip.position.set(s * 3.1, -.05, -.4); g.add(tip); const fin = new Mesh(rbox(.1, 1.3, 1.1, .04), m.body); fin.position.set(s * .6, .7, -2.1); fin.rotation.z = s * -.3; g.add(fin); }
  const tail = new Mesh(rbox(2.6, .1, .9, .04), m.body); tail.position.set(0, 0, -2.2); g.add(tail);
  const noz = new Mesh(new CylinderGeometry(.42, .36, .5, 14), m.dark); noz.rotation.x = Math.PI / 2; noz.position.z = -2.7; g.add(noz);
  const flame = new Mesh(new ConeGeometry(.33, 2.2, 12), m.flame); flame.rotation.x = -Math.PI / 2; flame.position.z = -4; g.add(flame);
  g.traverse(o => { if (o.isMesh && o !== flame) o.castShadow = true; });
  g.userData.flame = flame; return g;
}

function make(api) {
  const stick = new Stick({ floating: true, dead: 0, zone: [0, 0, 1e5, 1e5] });   // drag like a joystick where the finger lands
  want('motion');
  let v, sunL, jet, rings, ringIM, trail, dust, boom, built;
  let p, yaw, vyaw, climb, speed, shields, hurtT, score, mult, t, msg, fingers, keys, boost, dist, prox, ringsGot;
  const mx = new Object3D(), camPos = new Vector3(), tmp = new Vector3();
  const ready = new Ready({ eat: false, text: 'Tap to fly' });          // the jet holds its line until the first touch
  let fdt = 1 / 60;

  function wallGeo(side) {   // a tall strip of rock on one side of the canyon, bulging in and out
    const rows = 7, pos = new Float32Array((NS + 1) * rows * 3), uv = new Float32Array((NS + 1) * rows * 2), idx = [];
    for (let i = 0; i <= NS; i++) {
      const z = i * SEG, c = cx(z), hw = half(z);
      for (let j = 0; j < rows; j++) {
        const y = -4 + j * 12, bulge = Math.sin(z * .07 + j * 1.3 + side) * 1.6 + Math.sin(z * .19 + j) * .7 + j * j * .5;
        const k = (i * rows + j) * 3; pos[k] = c + side * (hw + bulge); pos[k + 1] = y; pos[k + 2] = z;
        uv[(i * rows + j) * 2] = z / 30; uv[(i * rows + j) * 2 + 1] = y / 30;
        if (i < NS && j < rows - 1) { const a = i * rows + j, b = a + rows; if (side < 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b); }
      }
    }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function floorGeo() {
    const cols = 9, pos = new Float32Array((NS + 1) * cols * 3), uv = new Float32Array((NS + 1) * cols * 2), idx = [];
    for (let i = 0; i <= NS; i++) {
      const z = i * SEG, c = cx(z), hw = half(z) + 6;
      for (let j = 0; j < cols; j++) { const x = c - hw + j / (cols - 1) * hw * 2, k = (i * cols + j); pos.set([x, floorY(z) + Math.sin(x * .3 + z * .1) * .3, z], k * 3); uv.set([x / 20, z / 20], k * 2); if (i < NS && j < cols - 1) { const a = k, b = a + cols; idx.push(a, a + 1, b, a + 1, b + 1, b); } }
    }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function setup() {
    v = new HDView({ bg: '#e8a878', fog: .0045, env: .4, sky: '#ffd8b0', ground: '#6a3a24', amb: .55, fov: 70 });
    v.exposure = 1; v.bloom = .5; v.cam.far = 400; v.cam.updateProjectionMatrix();
    sunL = sun('#ffe0b0', 3.4, 40, [.6, .55, -.3]); v.scene.add(sunL, sunL.target); v.onTier(T => sunL.setTier(T));
    const m = looks();
    for (const s of [-1, 1]) { const w = new Mesh(wallGeo(s), m.wall); w.receiveShadow = true; w.castShadow = true; w.frustumCulled = false; v.scene.add(w); }
    const f = new Mesh(floorGeo(), m.floor); f.receiveShadow = true; f.frustumCulled = false; v.scene.add(f);
    jet = makeJet(); v.scene.add(jet);
    rings = []; for (let z = 300; z < LEN - 100; z += rnd(110, 170)) rings.push({ z, x: cx(z) + rnd(-.5, .5) * half(z), y: floorY(z) + rnd(5, 24), got: false });
    ringIM = new InstancedMesh(new TorusGeometry(4.5, .35, 10, 40), m.ring, rings.length); ringIM.castShadow = true; ringIM.frustumCulled = false; v.scene.add(ringIM);
    trail = new Particles(v, { max: 400, additive: true }); dust = new Particles(v, { max: 300, additive: false }); boom = new Particles(v, { max: 200, additive: true });
  }
  function writeRings() { rings.forEach((r, i) => { mx.position.set(r.x, r.y, r.z); mx.rotation.set(0, 0, t * .5 + i); mx.scale.setScalar(r.got ? 0 : 1); mx.updateMatrix(); ringIM.setMatrixAt(i, mx.matrix); }); ringIM.instanceMatrix.needsUpdate = true; }
  function crash(why) {
    if (hurtT > 0) return; shields--; hurtT = 1.5; haptic('error'); sounds.boom(.9); msg = { txt: shields > 0 ? 'SCRAPED!' : 'GOING DOWN', sub: why, l: 1.3, col: '#ff5a4a' }; mult = 1;
    for (let i = 0; i < 40; i++) boom.emit({ x: p.x, y: p.y, z: p.z + 2, vx: rnd(-8, 8), vy: rnd(-4, 8), vz: rnd(-4, 10), life: rnd(.3, .8), size: rnd(.4, 1), col: [6, 2.5, .6], drag: 2, grav: 6 });
  }
  function update(dt) {
    fdt = dt;
    if (!ready.update(dt)) return fx(dt);
    t += dt; hurtT = Math.max(0, hurtT - dt); boost = Math.max(0, boost - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    if (t < 1.2) return fx(dt);
    // input: tilt is the stick (left/right banks, forward/back noses down/up); drag fallback
    let ix = stick.x, iy = stick.y; const tl = tilt();
    if (!stick.active && tl) { ix = clamp(tl.x * 1.3, -1, 1); iy = clamp(tl.y * 1.3, -1, 1); }
    if (keys.has('ArrowLeft') || keys.has('a')) ix = -1; if (keys.has('ArrowRight') || keys.has('d')) ix = 1; if (keys.has('ArrowUp') || keys.has('w')) iy = -1; if (keys.has('ArrowDown') || keys.has('s')) iy = 1;
    vyaw = approach(vyaw, -ix * 1.15, 4, dt); yaw += vyaw * dt; yaw = clamp(yaw, -1, 1);
    climb = approach(climb, iy * 18, 4, dt);
    speed = Math.min(78, 52 + t * .3) + (boost > 0 ? 25 : 0);
    p.x += Math.sin(yaw) * speed * dt; p.z += Math.cos(yaw) * speed * dt; p.y += climb * dt;
    // the canyon pulls your heading back along its line a little, so it never feels unfair
    const ahead = cx(p.z + 30) - cx(p.z), want = Math.atan2(ahead, 30); yaw = approach(yaw, want, .4, dt);
    const c = cx(p.z), hw = half(p.z), fy = floorY(p.z), dl = p.x - (c - hw), dr = c + hw - p.x, df = p.y - fy;
    if (dl < 2.4) { p.x = c - hw + 4; yaw = Math.abs(yaw) * .5 + .2; crash('Hit the canyon wall'); }
    if (dr < 2.4) { p.x = c + hw - 4; yaw = -Math.abs(yaw) * .5 - .2; crash('Hit the canyon wall'); }
    if (df < 1.2) { p.y = fy + 4; climb = 8; crash('Hit the ground'); }
    if (p.y > CEIL) { p.y = CEIL; climb = Math.min(climb, 0); if (!msg) msg = { txt: 'TOO HIGH: RADAR!', l: .8, col: '#ffcc30' }; mult = 1; }
    // proximity multiplier: skim the rock
    prox = Math.min(dl, dr, df * 1.4); const target = prox < 4 ? 4 : prox < 7 ? 3 : prox < 11 ? 2 : 1;
    mult += (target - mult) * Math.min(1, dt * (target > mult ? 1.5 : 3));
    if (prox < 6 && (t * 14 | 0) !== ((t - dt) * 14 | 0)) haptic('tick');
    const dd = p.z / 10; if (dd > dist) { score += (dd - dist) * Math.round(mult); dist = dd; }
    for (const r of rings) if (!r.got && Math.abs(r.z - p.z) < 2.5 && Math.hypot(r.x - p.x, r.y - p.y) < 4.6) { r.got = true; ringsGot++; boost = 1.6; score += 100; haptic('success'); sounds.powerup(); msg = { txt: 'RING +100', sub: 'AFTERBURNER', l: 1, col: '#ffcc30' }; }
    api.score(Math.floor(score));
    if (shields <= 0) { sounds.lose(); return api.over(); }
    if (p.z > LEN - 150) { score += 1000; api.score(Math.floor(score)); msg = { txt: 'CANYON CLEARED!', l: 3, col: '#8affdc' }; return api.over(); }
    fx(dt);
  }
  function fx(dt) {
    trail.emit({ x: p.x - Math.sin(yaw) * 4, y: p.y, z: p.z - Math.cos(yaw) * 4, vx: rnd(-.5, .5), vy: rnd(-.5, .5), vz: -5, life: .25, size: boost > 0 ? .9 : .5, col: boost > 0 ? [2, 3, 6] : [5, 2.5, .8], a: .8 });
    if (p.y - floorY(p.z) < 7) dust.emit({ x: p.x + rnd(-2, 2), y: floorY(p.z) + .3, z: p.z - 3, vx: rnd(-3, 3), vy: rnd(1, 3), vz: 5, life: 1, size: rnd(1, 2.4), grow: 2, col: [.75, .5, .35], a: .45, drag: 1.5, fadeIn: 1 });
    trail.update(dt); dust.update(dt); boom.update(dt);
  }
  function draw(c) {
    if (!built) self.reset();
    jet.position.copy(p); jet.rotation.set(-climb * .025, yaw, -vyaw * .9, 'YXZ'); jet.userData.flame.scale.set(1, boost > 0 ? 1.8 + Math.random() * .4 : .8 + Math.random() * .3, 1);
    jet.visible = hurtT <= 0 || (t * 12 | 0) % 2 === 0;
    tmp.set(p.x - Math.sin(yaw) * 13, p.y + 3.6, p.z - Math.cos(yaw) * 13);
    if (!camPos.lengthSq()) camPos.copy(tmp); camPos.lerp(tmp, 1 - Math.pow(.82, fdt * 60));
    v.cam.position.copy(camPos); v.cam.up.set(Math.sin(-vyaw * .25), 1, 0).normalize(); v.cam.lookAt(p.x + Math.sin(yaw) * 20, p.y + climb * .3, p.z + Math.cos(yaw) * 20);
    const fov = 66 + (boost > 0 ? 12 : 0) + clamp((speed - 52) * .3, 0, 8); if (Math.abs(v.cam.fov - fov) > .2) { v.cam.fov += (fov - v.cam.fov) * (1 - Math.pow(.88, fdt * 60)); v.cam.updateProjectionMatrix(); }
    sunL.follow(p.x, p.y - 10, p.z + 20); writeRings(); v.hurt = hurtT * .4;
    v.render(c, W, H); hud(c);
  }
  function hud(c) {
    const u = Math.min(W, H) / 300; c.save(); c.textBaseline = 'middle';
    c.fillStyle = '#2a120890'; c.beginPath(); c.roundRect(8 * u, 8 * u, 96 * u, 34 * u, 10 * u); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `800 ${15 * u}px Rubik, sans-serif`; c.fillText(String(Math.floor(score)), 16 * u, 21 * u);
    c.font = `700 ${7 * u}px Rubik, sans-serif`; c.fillStyle = '#ffd8a0'; c.fillText(`${Math.round(speed * 3.6)} KM/H`, 16 * u, 34 * u);
    for (let k = 0; k < 3; k++) { c.fillStyle = k < shields ? '#8affdc' : '#ffffff30'; c.beginPath(); c.arc(78 * u + k * 9 * u, 21 * u, 3 * u, 0, 7); c.fill(); }
    const m = Math.round(mult); c.textAlign = 'right'; c.fillStyle = m >= 4 ? '#ff5a4a' : m >= 3 ? '#ffcc30' : m >= 2 ? '#fff' : '#ffffff60';
    c.font = `800 ${22 * u}px Rubik, sans-serif`; c.fillText(`x${m}`, W - 14 * u, 24 * u); c.font = `700 ${7 * u}px Rubik, sans-serif`; c.fillText(m > 1 ? 'SKIMMING!' : 'GET CLOSER', W - 14 * u, 40 * u);
    if (stick.active) { c.strokeStyle = '#ffffff40'; c.lineWidth = 2 * u; c.beginPath(); c.arc(stick.cx, stick.cy, 34 * u, 0, 7); c.stroke(); c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(stick.cx + stick.x * 34 * u, stick.cy + stick.y * 34 * u, 10 * u, 0, 7); c.fill(); }
    if (msg) { c.textAlign = 'center'; c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.col; c.font = `800 ${16 * u}px Rubik, sans-serif`; c.fillText(msg.txt, W / 2, H * .26); if (msg.sub) { c.font = `700 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .26 + 15 * u); } c.globalAlpha = 1; }
    if (ready.playing && t < 4) { c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = `600 ${8.5 * u}px Rubik, sans-serif`; c.fillText(tilt() ? 'Tilt to fly · skim the rock for a bigger multiplier' : 'Drag to fly · skim the rock for a bigger multiplier', W / 2, H * .7); }
    c.restore();
    ready.draw(c, W, H, { size: 13 * u });
  }
  const self = {
    reset() {
      if (!v) setup();
      p = new Vector3(cx(20), floorY(20) + 12, 20); yaw = 0; vyaw = 0; climb = 0; speed = 52; shields = 3; hurtT = 0; score = 0; mult = 1; t = 0; msg = null; fingers = {}; keys = new Set(); boost = 0; dist = 2; prox = 20; ringsGot = 0;
      stick.release(); rings.forEach(r => r.got = false); camPos.set(0, 0, 0); trail.clear(); dust.clear(); boom.clear(); calibrateTilt(); built = true; ready.reset();
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) { trail.update(dt); dust.update(dt); boom.update(dt); } },
    down(x, y, id = 0) { if (ready.waiting) { ready.go(); calibrateTilt(); } stick.r = Math.min(W, H) * .13; stick.down(x, y, id); },
    move(x, y, pr, id = 0) { if (pr) stick.move(x, y, pr, id); },
    up(x, y, id = 0) { stick.up(x, y, id); },
    key(k, d) { if (d) { ready.go(); keys.add(k); } else keys.delete(k); },
  };
  return self;
}

export default {
  id: 'canyon-ace',
  title: 'Canyon Ace',
  tag: 'Next Gen · Flying',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 1500, reward: 25,
  hint: 'Fly a jet low through a desert canyon. Tilt the phone to fly (or drag like a joystick): bank to turn, tip forward to dive, back to climb. Skim the walls and the floor to push the multiplier up to x4, fly through gold rings for an afterburner boost. Three scrapes and the jet is done.',
  traits: ['theme:desert'],
  make,
};
