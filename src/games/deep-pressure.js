import gs from '../gamescroll.js';
const { Timers } = gs.math;
const { sounds, tone, noise } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Ready } = gs.rounds;
const { HDView, Particles, pbr, rbox, surface, speckle, spot, pulse, THREE } = gs.hd;
const { approach } = gs.juice;
const { Stick } = gs.controls;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, CatmullRomCurve3, TubeGeometry, CylinderGeometry, SphereGeometry, CapsuleGeometry, ConeGeometry, IcosahedronGeometry, BoxGeometry, BackSide, Color } = THREE;

// Deep Pressure: steer a little submarine down a pitch-black ocean trench. Your lamp only shows a
// few metres. Tap to PING: a sonar ring sweeps out and lights up the cave, the rocks and the mines,
// and the echoes come back through your hands as haptic taps (sooner = closer). But every ping is
// noise, and something big lives down here: make too much and the Lurker comes for you. Scrape a
// wall or hit a mine and the hull cracks; three cracks and it's over. Grab pearls for points.
// One thumb: drag to steer, quick tap to ping. Two thumbs: left steers, right taps ping.
let W = 300, H = 300;
const R = 6.5, NF = 1400, HULL = 3;

const PING = { pos: { value: new Vector3() }, r: { value: 0 }, a: { value: 0 } };
// the sonar ring on a lit material: a bright band at distance r from the ping (gs.hd.pulse; works on WebGL and WebGPU)
const sonar = m => pulse(m, { at: PING.pos, radius: PING.r, strength: PING.a, color: [.15 * 2.2, .95 * 2.2, 2.2] });

let MT = null;
function looks() {
  if (MT) return MT;
  const rock = surface(512, ({ col, h, r, size: S }) => {
    col.fillStyle = '#4a525c'; col.fillRect(0, 0, S, S); h.fillStyle = '#606060'; h.fillRect(0, 0, S, S);
    for (let i = 0; i < 180; i++) { const x = rnd(0, S), y = rnd(0, S), rr = rnd(8, 50), g = h.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, Math.random() < .5 ? '#c0c0c0' : '#202020'); g.addColorStop(1, '#60606000'); h.fillStyle = g; h.beginPath(); h.arc(x, y, rr, 0, 7); h.fill(); }
    speckle(col, S, 3000, '#14181c', 2, .5); speckle(col, S, 900, '#4a5560', 1.5, .4); speckle(col, S, 200, '#3a6a60', 3, .3);   // algae
    r.fillStyle = '#bbb'; r.fillRect(0, 0, S, S);
  }, { strength: 4 });
  MT = {
    rock: sonar(pbr('#ffffff', { tex: rock, rough: 1, side: BackSide })), spike: sonar(pbr('#3a3e44', { rough: .8 })),
    mine: sonar(pbr('#2a2e36', { rough: .3, metal: .9 })), mineLed: pbr('#ff2a2a', { glow: 3 }),
    pearl: sonar(pbr('#e8f4ff', { rough: .1, metal: .2, clear: 1, glow: .6, glowCol: '#80d0ff' })),
    hull: pbr('#f2b81a', { rough: .3, metal: .3, clear: 1 }), dark: pbr('#24282e', { rough: .4, metal: .7 }), port: pbr('#9fe8ff', { glow: 1.6, rough: .05 }), lamp: pbr('#fff6d0', { glow: 5 }),
    lurk: pbr('#1a1418', { rough: .5, sheen: 1 }), lure: pbr('#9affd8', { glow: 6 }), eye: pbr('#ff6020', { glow: 4 }),
  };
  return MT;
}
function makeSub() {
  const m = looks(), g = new Group();
  const hull = new Mesh(new CapsuleGeometry(.45, 1.5, 8, 16), m.hull); hull.rotation.x = Math.PI / 2; g.add(hull);
  const tower = new Mesh(rbox(.35, .4, .7, .12), m.hull); tower.position.set(0, .5, -.1); g.add(tower);
  const port = new Mesh(new SphereGeometry(.28, 16, 12), m.port); port.position.set(0, .05, .9); port.scale.z = .6; g.add(port);
  for (const s of [-1, 1]) { const fin = new Mesh(rbox(.6, .06, .35, .03), m.dark); fin.position.set(s * .45, 0, -.7); g.add(fin); const lamp = new Mesh(new SphereGeometry(.08, 8, 6), m.lamp); lamp.position.set(s * .3, -.25, .85); g.add(lamp); }
  const prop = new Group(); prop.position.z = -1.25; g.add(prop);
  for (let i = 0; i < 3; i++) { const b = new Mesh(rbox(.06, .45, .02, .02), m.dark); b.rotation.z = i / 3 * Math.PI * 2; b.position.set(Math.sin(i / 3 * Math.PI * 2) * .18, Math.cos(i / 3 * Math.PI * 2) * .18, 0); prop.add(b); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.prop = prop; return g;
}
function makeLurker() {
  const m = looks(), g = new Group();
  const body = new Mesh(new SphereGeometry(2.2, 24, 16), m.lurk); body.scale.set(1, .85, 1.3); g.add(body);
  const jaw = new Mesh(new SphereGeometry(2, 20, 12, 0, Math.PI * 2, Math.PI * .55, Math.PI * .45), m.lurk); jaw.position.set(0, -.3, .8); g.add(jaw);
  for (let i = 0; i < 9; i++) { const tooth = new Mesh(new ConeGeometry(.12, .6, 5), pbr('#e8e0d0', { rough: .4 })); const a = -1.1 + i * .275; tooth.position.set(Math.sin(a) * 1.7, -.2, 2.3 + Math.cos(a) * .3 - .3); tooth.rotation.x = Math.PI; g.add(tooth); }
  for (const s of [-1, 1]) { const e = new Mesh(new SphereGeometry(.22, 10, 8), m.eye); e.position.set(s * 1.1, .9, 2); g.add(e); }
  const stalk = new Mesh(new CylinderGeometry(.05, .08, 2.6, 6), m.lurk); stalk.position.set(0, 2.4, 1.5); stalk.rotation.x = .7; g.add(stalk);
  const lure = new Mesh(new SphereGeometry(.25, 12, 8), m.lure); lure.position.set(0, 3.3, 2.6); g.add(lure);
  return g;
}

function make(api) {
  const stick = new Stick({ floating: true, dead: 0, zone: [0, 0, 1e5, 1e5] });   // the drag stick: where the finger lands (the game picks which finger)
  const timers = new Timers(), later = (fn, ms) => timers.after(ms / 1000, fn);   // game-time delays: they pause with the game
  let v, sub, lurker, lamp, bubbles, snow, spark, curve, LEN, PT, TN, NN, BN, world, spikes, mines, pearls, pearlIM, built;
  let d, ox, oy, vx, vy, speed, hull, hurtT, pingT, noiseLvl, lurkGap, lurkT, score, pearlsGot, t, msg, fingers, keys, best, beatT;
  const ready = new Ready({ eat: false, text: 'Tap to dive' });         // the sub holds still until the first touch
  let fdt = 1 / 60;
  const mx = new Object3D(), pos = new Vector3(), tmp = new Vector3(), camPos = new Vector3(), look = new Vector3(), camOff = { x: 0, y: 0 };

  function frame(dd) { const f = ((dd % LEN) + LEN) % LEN / LEN * NF, i = Math.floor(f) % NF; return i; }
  // smooth position + frame along the trench: blend the two nearest samples, so nothing steps from one to the next
  const aN = new Vector3(), aB = new Vector3(), dT = new Vector3(), dN = new Vector3(), dB = new Vector3();
  function blend(dd) { const f = ((dd % LEN) + LEN) % LEN / LEN * NF, i = Math.floor(f) % NF; return [i, f - Math.floor(f)]; }
  function at(dd, x, y, out = pos) { const [i, k] = blend(dd); aN.lerpVectors(NN[i], NN[i + 1], k).normalize(); aB.lerpVectors(BN[i], BN[i + 1], k).normalize(); return out.lerpVectors(PT[i], PT[i + 1], k).addScaledVector(aN, y).addScaledVector(aB, x); }
  function basis(dd) { const [i, k] = blend(dd); dT.lerpVectors(TN[i], TN[i + 1], k).normalize(); dN.lerpVectors(NN[i], NN[i + 1], k).normalize(); dB.lerpVectors(BN[i], BN[i + 1], k).normalize(); }
  function setup() {
    v = new HDView({ bg: '#010409', fog: .055, env: .15, sky: '#1a4058', ground: '#000000', amb: .22, fov: 70 }).lampLights(10);
    v.exposure = 1.1; v.bloom = .8;
    // a sub's camera: heavy grain in the black, halation round the lamp and the sonar glow, the beam through the murky water (high and ultra)
    v.film = { halation: .45, grain: 1.7, grainSize: 1.4, fringe: .025, halationTint: [.3, .7, 1] };
    lamp = spot('#fff4d8', 90, 26, .42); v.scene.add(lamp, lamp.target); v.onTier(T => lamp.setTier(T));
    v.beams = { light: lamp, density: .06, strength: .55, far: 26, glow: .6 };
    sub = makeSub(); v.scene.add(sub); lurker = makeLurker(); v.scene.add(lurker);
    bubbles = new Particles(v, { max: 200, additive: false }); snow = new Particles(v, { max: 400, additive: false }); spark = new Particles(v, { max: 200, additive: true });
  }
  function buildWorld() {
    setup(); const m = looks();
    if (world) { v.scene.remove(world); world.traverse(o => o.userData.own && o.geometry.dispose()); }
    world = new Group(); v.scene.add(world);
    const pts = []; let x = 0, y = 0;
    for (let i = 0; i < 40; i++) { pts.push(new Vector3(x, y, i * 30)); x += rnd(-14, 14); y -= rnd(4, 14); }
    curve = new CatmullRomCurve3(pts, false, 'centripetal'); LEN = curve.getLength();
    const fr = curve.computeFrenetFrames(NF, false); TN = fr.tangents; NN = fr.normals; BN = fr.binormals; PT = [];
    // keep "up" roughly up: rebuild normals from world up so the tunnel doesn't twist
    for (let i = 0; i <= NF; i++) { PT.push(curve.getPointAt(i / NF)); const tg = TN[i]; BN[i] = new Vector3().crossVectors(tg, new Vector3(0, 1, 0)).normalize(); NN[i] = new Vector3().crossVectors(BN[i], tg).normalize(); }
    const tube = new Mesh(new TubeGeometry(curve, 600, R, 18, false), m.rock); tube.userData.own = true; tube.receiveShadow = true;
    for (const k of ['map', 'normalMap', 'roughnessMap']) { m.rock[k].repeat.set(Math.round(LEN / 12), 2); m.rock[k].needsUpdate = true; }
    world.add(tube);
    // rock spikes from the walls, mines floating in the middle, pearls in between
    spikes = []; mines = []; pearls = [];
    for (let dd = 60; dd < LEN - 20; dd += rnd(9, 18)) {
      const r = Math.random(), a = rnd(0, Math.PI * 2);
      if (r < .55) spikes.push({ d: dd, a, len: rnd(2.5, 4.8) });
      else if (r < .8) mines.push({ d: dd, x: rnd(-3, 3), y: rnd(-3, 3), on: true });
      if (Math.random() < .6) pearls.push({ d: dd + rnd(3, 6), x: rnd(-3.5, 3.5), y: rnd(-3.5, 3.5), on: true });
    }
    const sp = new InstancedMesh(new ConeGeometry(1, 1, 7), m.spike, spikes.length);
    spikes.forEach((s, i) => { const i0 = frame(s.d), dir = tmp.copy(NN[i0]).multiplyScalar(Math.sin(s.a)).addScaledVector(BN[i0], Math.cos(s.a)); at(s.d, Math.cos(s.a) * (R - s.len / 2 + .3), Math.sin(s.a) * (R - s.len / 2 + .3)); mx.position.copy(pos); mx.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().negate()); mx.scale.set(s.len * .32, s.len, s.len * .32); mx.updateMatrix(); sp.setMatrixAt(i, mx.matrix); });
    sp.castShadow = true; sp.receiveShadow = true; sp.frustumCulled = false; world.add(sp);
    const mn = new InstancedMesh(new IcosahedronGeometry(.7, 0), m.mine, mines.length), led = new InstancedMesh(new SphereGeometry(.12, 6, 4), m.mineLed, mines.length);
    mines.forEach((s, i) => { at(s.d, s.x, s.y); mx.position.copy(pos); mx.quaternion.identity(); mx.scale.setScalar(1); mx.updateMatrix(); mn.setMatrixAt(i, mx.matrix); mx.position.y += .72; mx.updateMatrix(); led.setMatrixAt(i, mx.matrix); });
    mn.castShadow = true; mn.frustumCulled = led.frustumCulled = false; world.add(mn, led); mines.im = mn; mines.led = led;
    pearlIM = new InstancedMesh(new SphereGeometry(.28, 14, 10), m.pearl, pearls.length); pearlIM.frustumCulled = false; world.add(pearlIM);
    pearls.forEach((s, i) => { at(s.d, s.x, s.y); mx.position.copy(pos); mx.scale.setScalar(1); mx.updateMatrix(); pearlIM.setMatrixAt(i, mx.matrix); });
    built = true; v.warmed = false;
  }
  function hide(im, i) { mx.scale.setScalar(0); mx.position.set(0, -999, 0); mx.updateMatrix(); im.setMatrixAt(i, mx.matrix); im.instanceMatrix.needsUpdate = true; }
  function ping() {
    if (pingT < .5) return;
    pingT = 0; noiseLvl = Math.min(1.2, noiseLvl + .28);
    tone(1500, { len: .5, wave: 'sine', vol: .07, slide: -200 }); haptic('light');
    // echoes: the nearest things ahead answer back, sooner when closer
    const near = [...spikes.map(s => ({ d: s.d, w: .5 })), ...mines.filter(m => m.on).map(m => ({ d: m.d, w: 1 }))].map(o => ({ ...o, gap: o.d - d })).filter(o => o.gap > 0 && o.gap < 40).sort((a, b) => a.gap - b.gap).slice(0, 4);
    near.forEach((o, i) => later(() => { haptic(o.gap < 12 ? 'heavy' : o.gap < 24 ? 'medium' : 'light'); tone(1200 - o.gap * 15, { len: .07, wave: 'sine', vol: .045 }); }, 120 + o.gap * 28));
  }
  function crack(why) {
    if (hurtT > 0) return; hull--; hurtT = 1.2; haptic('error'); sounds.hurt(.7); noise(.4, { vol: .12, from: 2500, to: 200 });
    msg = { txt: hull > 0 ? `HULL CRACKED · ${hull} LEFT` : 'HULL BREACH', sub: why, l: 1.4, col: '#ff6a5a' };
    for (let i = 0; i < 30; i++) bubbles.emit({ x: sub.position.x, y: sub.position.y, z: sub.position.z, vx: rnd(-2, 2), vy: rnd(.5, 3), vz: rnd(-2, 2), life: rnd(1, 2), size: rnd(.05, .15), col: [.7, .85, 1], a: .7, drag: 1.5, grav: -1.5 });
  }
  function update(dt) { timers.update(dt);
    fdt = dt; if (!ready.update(dt)) return fx(dt);
    t += dt; pingT += dt; hurtT = Math.max(0, hurtT - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    PING.r.value = pingT * 22; PING.a.value = Math.max(0, 1 - pingT / 1.6);
    // steering
    let sx = stick.x, sy = stick.y;
    if (keys.has('ArrowLeft') || keys.has('a')) sx = -1; if (keys.has('ArrowRight') || keys.has('d')) sx = 1;
    if (keys.has('ArrowUp') || keys.has('w')) sy = -1; if (keys.has('ArrowDown') || keys.has('s')) sy = 1;
    vx = approach(vx, sx * 7, 3, dt); vy = approach(vy, -sy * 7, 3, dt);
    ox += vx * dt; oy += vy * dt;
    speed = Math.min(15, 6.5 + t * .06); d += speed * dt;
    const rr = Math.hypot(ox, oy);
    if (rr > R - 1.1) { const k2 = (R - 1.1) / rr; ox *= k2; oy *= k2; vx *= -.4; vy *= -.4; crack('Scraped the wall'); }
    // hazards
    for (const s of spikes) { const gap = s.d - d; if (gap > -1 && gap < 1) { const tip = R - s.len, px = Math.cos(s.a), py = Math.sin(s.a), along = ox * px + oy * py, side = Math.abs(-ox * py + oy * px); if (along > tip - .5 && side < s.len * .3 + .4) crack('Hit a rock spike'); } }
    mines.forEach((m, i) => { if (m.on && Math.abs(m.d - d) < 1.2 && Math.hypot(m.x - ox, m.y - oy) < 1.3) { m.on = false; hide(mines.im, i); hide(mines.led, i); at(m.d, m.x, m.y, tmp); for (let j = 0; j < 50; j++) spark.emit({ x: tmp.x, y: tmp.y, z: tmp.z, vx: rnd(-6, 6), vy: rnd(-6, 6), vz: rnd(-6, 6), life: rnd(.3, .7), size: rnd(.2, .4), col: [5, 2.2, .6], drag: 3 }); sounds.boom(); crack('Mine!'); } });
    pearls.forEach((p, i) => { if (p.on && Math.abs(p.d - d) < 1.2 && Math.hypot(p.x - ox, p.y - oy) < 1.1) { p.on = false; hide(pearlIM, i); pearlsGot++; sounds.coin(1.4); haptic('success'); msg = msg || { txt: '+10 PEARL', l: .7, col: '#bfeaff' }; } });
    // the Lurker: noise draws it closer; when it catches you it bites a crack out of the hull
    noiseLvl = Math.max(0, noiseLvl - dt * .06);
    const want = 46 - noiseLvl * 40; lurkGap += (want - lurkGap) * Math.min(1, dt * (want < lurkGap ? .8 : .3));
    if (lurkGap < 6 && hurtT <= 0) { crack('The Lurker bit you!'); noiseLvl = .2; lurkGap = 30; sounds.boom(.6); }
    beatT -= dt; if (lurkGap < 22 && beatT <= 0) { beatT = .25 + lurkGap / 30; haptic(lurkGap < 12 ? 'heavy' : 'medium'); tone(60, { len: .1, wave: 'sine', vol: .08 }); }
    score = Math.floor(d / 5) + pearlsGot * 10; api.score(score);
    if (hull <= 0) { sounds.lose(); return api.over(); }
    if (d > LEN - 40) { msg = { txt: 'TRENCH FLOOR!', sub: '+250', l: 3, col: '#8affdc' }; pearlsGot += 25; api.score(Math.floor(d / 5) + pearlsGot * 10); haptic('success'); return api.over(); }
    fx(dt);
  }
  function fx(dt) {
    if (Math.random() < .5) bubbles.emit({ x: sub.position.x + rnd(-.2, .2), y: sub.position.y, z: sub.position.z, vx: rnd(-.3, .3), vy: rnd(.2, .8), vz: rnd(-.3, .3), life: 1.6, size: rnd(.04, .09), col: [.6, .8, .9], a: .5, grav: -1 });
    for (let i = 0; i < 3; i++) { at(d + rnd(2, 22), rnd(-R, R) * .8, rnd(-R, R) * .8, tmp); snow.emit({ x: tmp.x, y: tmp.y, z: tmp.z, vy: -.15, life: 3, size: .04, col: [.7, .75, .7], a: .5, fadeIn: 1 }); }
    bubbles.update(dt); snow.update(dt); spark.update(dt);
  }
  function draw(c) {
    if (!built) self.reset();
    basis(d);
    at(d, ox, oy); sub.position.copy(pos);
    look.copy(pos).addScaledVector(dT, 4).addScaledVector(dB, vx * .06).addScaledVector(dN, vy * .06); sub.lookAt(look); sub.rotateZ(-vx * .05);
    sub.userData.prop.rotation.z += speed * 3 * fdt;
    const ease = 1 - Math.pow(.85, fdt * 60); camOff.x += (ox * .7 - camOff.x) * ease; camOff.y += (oy * .7 - camOff.y) * ease; at(d - 6, camOff.x, camOff.y + 1.6, camPos);   // forward motion is followed exactly, only sideways moves are eased
    v.cam.position.copy(camPos); v.cam.up.copy(dN); at(d + 8, ox * .5, oy * .5, look); v.cam.lookAt(look);
    lamp.position.copy(sub.position).addScaledVector(dT, 1); lamp.target.position.copy(sub.position).addScaledVector(dT, 20).addScaledVector(dB, vx * .3).addScaledVector(dN, vy * .3); lamp.target.updateMatrixWorld();
    // the Lurker trails behind (its lure glows in the dark when it's close)
    at(d - lurkGap, Math.sin(t * .7) * 2, Math.cos(t * .5) * 1.5, tmp); lurker.position.copy(tmp); at(d, 0, 0, look); lurker.lookAt(look); lurker.visible = lurkGap < 30;
    PING.pos.value.copy(sub.position);
    v.placeLamps([{ x: lurker.position.x, y: lurker.position.y + 3, z: lurker.position.z, col: '#7affd0', i: lurkGap < 30 ? 18 : 0 }, ...mines.filter(m => m.on && Math.abs(m.d - d) < 30).map(m => (at(m.d, m.x, m.y + .8, tmp), { x: tmp.x, y: tmp.y, z: tmp.z, col: '#ff3030', i: 4, flick: 1 }))], sub.position.x, sub.position.y, sub.position.z, t);
    v.hurt = hurtT * .6;
    v.render(c, W, H); hud(c);
  }
  function hud(c) {
    const u = Math.min(W, H) / 300; c.save(); c.textBaseline = 'middle';
    c.fillStyle = '#01040ab8'; c.beginPath(); c.roundRect(8 * u, 8 * u, 100 * u, 38 * u, 10 * u); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `800 ${15 * u}px Rubik, sans-serif`; c.fillText(String(score), 16 * u, 21 * u);
    c.font = `700 ${7 * u}px Rubik, sans-serif`; c.fillStyle = '#7fd8ff'; c.fillText(`DEPTH ${Math.round(-pos.y + 200)} M`, 16 * u, 34 * u);
    for (let k = 0; k < HULL; k++) { c.fillStyle = k < hull ? '#f2b81a' : '#ffffff25'; c.beginPath(); c.roundRect(70 * u + k * 11 * u, 16 * u, 8 * u, 8 * u, 2 * u); c.fill(); }
    // noise / lurker meter
    const mw = 90 * u, mx0 = W - mw - 12 * u;
    c.fillStyle = '#01040ab8'; c.beginPath(); c.roundRect(mx0 - 6 * u, 8 * u, mw + 12 * u, 38 * u, 10 * u); c.fill();
    c.fillStyle = '#ffffff20'; c.fillRect(mx0, 18 * u, mw, 5 * u); const k2 = clamp(1 - (lurkGap - 6) / 40, 0, 1);
    c.fillStyle = k2 > .6 ? '#ff5050' : k2 > .35 ? '#ffb040' : '#7affd0'; c.fillRect(mx0, 18 * u, mw * k2, 5 * u);
    c.fillStyle = '#cfe'; c.font = `700 ${7 * u}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(lurkGap < 14 ? 'LURKER CLOSE! GO QUIET' : 'LURKER', mx0 + mw / 2, 34 * u);
    // ping ready ring
    const pr = clamp(pingT / .5, 0, 1); c.strokeStyle = pr >= 1 ? '#7affd0' : '#ffffff40'; c.lineWidth = 2 * u; c.beginPath(); c.arc(W - 30 * u, H - 30 * u, 16 * u, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); c.stroke();
    c.fillStyle = pr >= 1 ? '#7affd0' : '#ffffff60'; c.font = `800 ${7 * u}px Rubik, sans-serif`; c.fillText('PING', W - 30 * u, H - 30 * u);
    if (stick.active) { c.strokeStyle = '#ffffff35'; c.lineWidth = 2 * u; c.beginPath(); c.arc(stick.cx, stick.cy, 34 * u, 0, 7); c.stroke(); c.fillStyle = '#ffffff50'; c.beginPath(); c.arc(stick.cx + stick.x * 34 * u, stick.cy + stick.y * 34 * u, 10 * u, 0, 7); c.fill(); }
    if (msg) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.col; c.font = `800 ${15 * u}px Rubik, sans-serif`; c.fillText(msg.txt, W / 2, H * .28); if (msg.sub) { c.fillStyle = '#fff'; c.font = `600 ${8 * u}px Rubik, sans-serif`; c.fillText(msg.sub, W / 2, H * .28 + 15 * u); } c.globalAlpha = 1; }
    if (ready.playing && t < 4) { c.fillStyle = '#ffffffd8'; c.font = `600 ${8.5 * u}px Rubik, sans-serif`; c.fillText('Drag to steer · tap to PING the dark · pings wake the Lurker', W / 2, H * .62); }
    c.restore();
    ready.draw(c, W, H, { size: 13 * u, y: H * .62 });
  }
  const self = {
    reset() { timers.clear();
      buildWorld();
      d = 8; ox = 0; oy = 0; vx = 0; vy = 0; speed = 6.5; hull = HULL; hurtT = 0; pingT = 1; noiseLvl = 0; lurkGap = 46; score = 0; pearlsGot = 0; t = 0; msg = null; fingers = {}; keys = new Set(); beatT = 0;
      stick.release(); camPos.set(0, 0, 0); camOff.x = camOff.y = 0; bubbles.clear(); snow.clear(); spark.clear(); PING.a.value = 0; ready.reset();
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) { bubbles.update(dt); spark.update(dt); } },
    down(x, y, id = 0) {
      ready.go();
      const f = { id, x, y, t0: t, moved: 0 }; fingers[id] = f;
      if (!stick.active && (x < W * .6 || Object.keys(fingers).length === 1)) { stick.r = Math.min(W, H) * .12; stick.down(x, y, id); }
      else ping();
    },
    move(x, y, p, id = 0) { const f = fingers[id]; if (!f || !p) return; f.moved = Math.max(f.moved, Math.hypot(x - f.x, y - f.y)); stick.move(x, y, p, id); },
    up(x, y, id = 0) {
      const f = fingers[id]; delete fingers[id]; if (!f) return;
      if (stick.up(x, y, id)) { if (t - f.t0 < .25 && f.moved < 10) ping(); }
    },
    key(k, dn) { if (dn) { ready.go(); keys.add(k); } else keys.delete(k); if (dn && k === ' ') ping(); },
  };
  return self;
}

export default {
  id: 'deep-pressure',
  title: 'Deep Pressure',
  tag: 'Next Gen · Survival',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 120, reward: 25,
  hint: 'Pilot a mini sub down a pitch-black trench. Drag to steer, tap to PING: sonar lights up the cave and the echoes buzz back through the phone (sooner = closer). Every ping is noise, and too much noise brings the Lurker. Dodge spikes and mines, grab pearls, keep the hull in one piece.',
  traits: ['theme:ocean'],
  make,
};
