import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { HDView, Particles, pbr, rbox, surface, speckle, spot, THREE } = gs.hd;
const { perCopy, freeCopies } = gs.props;
const {
  Group, Mesh, InstancedMesh, Object3D, Vector3, Matrix4, Color, CatmullRomCurve3, TubeGeometry, CylinderGeometry, TorusGeometry,
  OctahedronGeometry, PlaneGeometry, BoxGeometry, ConeGeometry, MeshBasicMaterial, BackSide, DoubleSide, AdditiveBlending, CanvasTexture, SRGBColorSpace,
} = THREE;

// Gravity Grip: an anti-gravity tunnel racer. The track is a giant tube, and your car grips every
// surface: steer left or right and you drive up the wall, across the ceiling and back down. The
// wheels are bigger than the body, so it drives either way up. Six cars, three laps. Hit the
// glowing chevrons for a boost, grab the spinning crystals for missiles (tap to fire; they home in
// on the car ahead), and steer around the barriers.
// One thumb: drag left/right to steer, tap to fire. Two thumbs: left steers, right taps fire and
// holds for nitro.
let W = 300, H = 300;
const R = 7, LAPS = 3, CARS = 6;
const COLS = ['#ff7a1a', '#e8323a', '#2aa0f0', '#f2c020', '#38d070', '#b048f0'];
const NAMES = ['YOU', 'VOLT', 'RIPTIDE', 'HALO', 'MANTIS', 'NOVA'];

let MT = null;
function looks() {
  if (MT) return MT;
  const tube = surface(512, g => {              // tunnel lining: armoured panels, lane markings
    const { col, h, r, size: S } = g;
    col.fillStyle = '#2a2e36'; col.fillRect(0, 0, S, S); h.fillStyle = '#808080'; h.fillRect(0, 0, S, S); r.fillStyle = '#909090'; r.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 128) for (let x = 0; x < S; x += 128) {
      const v = 38 + Math.random() * 14 | 0; col.fillStyle = `rgb(${v},${v + 3},${v + 10})`; col.fillRect(x + 4, y + 4, 120, 120);
      h.fillStyle = '#b0b0b0'; h.fillRect(x + 6, y + 6, 116, 116); r.fillStyle = Math.random() < .4 ? '#404040' : '#7a7a7a'; r.fillRect(x + 4, y + 4, 120, 120);
      for (const [bx, by] of [[12, 12], [116, 12], [12, 116], [116, 116]]) { col.fillStyle = '#5a606a'; col.beginPath(); col.arc(x + bx, y + by, 4, 0, 7); col.fill(); h.fillStyle = '#fff'; h.beginPath(); h.arc(x + bx, y + by, 4, 0, 7); h.fill(); }
    }
    speckle(col, S, 1500, '#000', 1.5, .4); speckle(col, S, 400, '#8a8f9a', 1, .3);
    for (let i = 0; i < 18; i++) { r.strokeStyle = '#ffffff40'; r.beginPath(); const y = Math.random() * S; r.moveTo(0, y); r.lineTo(S, y + rnd(-6, 6)); r.stroke(); }   // tyre polish
    col.fillStyle = '#c8ccd4'; for (let x = 0; x < S; x += 64) col.fillRect(x, S / 2 - 3, 32, 6);   // dashed centre line along the track
  }, { strength: 2 });
  const m = {
    tube: pbr('#ffffff', { tex: tube, rough: 1, metal: .45, side: BackSide }),
    neon: [pbr('#20e0ff', { glow: 2.4 }), pbr('#ff2a8a', { glow: 2.4 })], ring: pbr('#ffe8c0', { glow: 1.8 }), ringFrame: pbr('#30343c', { rough: .3, metal: .9 }),
    barrier: pbr('#e8e8e8', { rough: .4, clear: .6 }), hazard: pbr('#ff3a20', { glow: 3 }),
    boost: new MeshBasicMaterial({ color: new Color(.4, 3, 4), transparent: true, opacity: .9, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
    crystal: pbr('#ffd040', { glow: 3, rough: .1, metal: .3 }),
    tyre: pbr('#141414', { rough: .55 }), rim: pbr('#c8ccd4', { rough: .2, metal: 1 }), glass: pbr('#101820', { rough: .05, metal: .8, clear: 1 }),
    carbon: pbr('#1a1c20', { rough: .35, metal: .5, clear: .6 }), head: pbr('#ffffff', { glow: 3 }), tail: pbr('#ff2020', { glow: 2.5 }),
    flame: new MeshBasicMaterial({ color: new Color(4, 2, .8), transparent: true, opacity: .8, depthWrite: false, blending: AdditiveBlending }),
    missile: pbr('#e0e4ea', { rough: .3, metal: .8 }),
  };
  m.paint = COLS.map(c => pbr(c, { rough: .25, metal: .35, clear: 1 }));
  MT = { m, G: { box: new BoxGeometry(1, 1, 1), cyl: new CylinderGeometry(1, 1, 1, 20), torus: new TorusGeometry(1, .05, 8, 48), gem: new OctahedronGeometry(1), plane: new PlaneGeometry(1, 1), cone: new ConeGeometry(1, 1, 12) } };
  return MT;
}
function P(geo, mat, o = {}) {
  const m = new Mesh(geo, mat), s = o.s ?? 1;
  m.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s); m.position.set(o.x || 0, o.y || 0, o.z || 0); m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  m.castShadow = o.cast !== false; m.receiveShadow = true; return m;
}
const B = (w, h, d, mat, o = {}) => P(rbox(w, h, d, o.r ?? Math.min(w, h, d) * .25), mat, o);
/** A flip-proof racer: low wedge body, four big wheels that stand proud above and below it. */
function makeCar(i) {
  const { m, G } = looks(), g = new Group(), paint = m.paint[i];
  g.add(B(1.7, .42, 3.6, paint, { y: .55, r: .14 }), B(1.3, .36, 1.5, m.glass, { y: .86, z: -.15, r: .16 }), B(1.9, .12, .5, m.carbon, { y: .55, z: 2.0 }), B(1.8, .14, .6, m.carbon, { y: 1.0, z: -1.7 }));
  g.add(B(.12, .3, .5, m.carbon, { x: -.7, y: .85, z: -1.7 }), B(.12, .3, .5, m.carbon, { x: .7, y: .85, z: -1.7 }));
  g.add(B(1.72, .05, 3.62, m.carbon, { y: .36, r: .02 }));                                 // dark underside / side skirt line
  g.add(B(.25, .02, 3.3, m.rim, { y: .78, cast: false }));   // centre stripe
  for (const x of [-1, 1]) for (const z of [-1.25, 1.25]) {
    const w = new Group(); w.position.set(x * 1.05, .55, z); g.add(w);
    w.add(P(G.cyl, m.tyre, { sx: .62, sy: .5, sz: .62, rz: Math.PI / 2 }), P(G.cyl, m.rim, { sx: .36, sy: .52, sz: .36, rz: Math.PI / 2, cast: false }));
    (g.userData.wheels ||= []).push(w);
  }
  for (const x of [-.55, .55]) { g.add(B(.32, .1, .05, m.head, { x, y: .62, z: 1.82, cast: false })); g.add(B(.38, .1, .05, m.tail, { x, y: .64, z: -1.82, cast: false })); }
  const fl = new Group(); fl.position.set(0, .58, -1.95); g.add(fl);
  for (const x of [-.35, .35]) { const f = new Mesh(G.cone, m.flame); f.scale.set(.16, .9, .16); f.rotation.x = -Math.PI / 2; f.position.set(x, 0, -.4); fl.add(f); }
  g.userData.flame = fl;
  return g;
}

function make(api) {
  let v, curve, LEN, NF, PT, TN, NN, BN, tubeMesh, rings, ringSpots, obs, pads, gems, cars, me, missiles, add, smoke, head, world;
  let t, score, state, stT, msg, steer, keys, fingers, nitro, ammo, takedowns, place, shake, finishT, built;
  const tmp = new Vector3(), tmp2 = new Vector3(), mx = new Object3D(), basis = new Matrix4();

  /* ---------- track ---------- */
  function buildTrack() {
    const pts = [], n = 12;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = rnd(95, 150); pts.push(new Vector3(Math.cos(a) * r * 1.3, rnd(-22, 22), Math.sin(a) * r)); }
    curve = new CatmullRomCurve3(pts, true, 'centripetal');
    LEN = curve.getLength(); NF = 1200;
    const fr = curve.computeFrenetFrames(NF, true);
    PT = []; TN = fr.tangents; NN = fr.normals; BN = fr.binormals;
    for (let i = 0; i <= NF; i++) PT.push(curve.getPointAt(i / NF));
  }
  /** Position + orientation on the tube at distance d, angle a (0 = floor), h metres off the wall. */
  function at(d, a, h, out = tmp, up = tmp2) {
    const f = ((d % LEN) + LEN) % LEN / LEN * NF, i = Math.floor(f), k = f - i, j = (i + 1) % NF;
    const nx = NN[i].x + (NN[j].x - NN[i].x) * k, ny = NN[i].y + (NN[j].y - NN[i].y) * k, nz = NN[i].z + (NN[j].z - NN[i].z) * k;
    const bx = BN[i].x + (BN[j].x - BN[i].x) * k, by = BN[i].y + (BN[j].y - BN[i].y) * k, bz = BN[i].z + (BN[j].z - BN[i].z) * k;
    const c = Math.cos(a), s = Math.sin(a), rr = R - h;
    // radial direction from the tube centre to the wall; "up" for the car is the opposite
    const rx = c * nx + s * bx, ry = c * ny + s * by, rz = c * nz + s * bz;
    const p0 = PT[i], p1 = PT[i + 1] || PT[0];
    out.set(p0.x + (p1.x - p0.x) * k + rx * rr, p0.y + (p1.y - p0.y) * k + ry * rr, p0.z + (p1.z - p0.z) * k + rz * rr);
    up.set(-rx, -ry, -rz).normalize();
    return out;
  }
  function tangent(d, out) { const f = ((d % LEN) + LEN) % LEN / LEN * NF, i = Math.floor(f) % NF, j = (i + 1) % NF, k = f - Math.floor(f); return out.copy(TN[i]).lerp(TN[j], k).normalize(); }
  /** Place object o on the tube at (d, a, h) facing along the track (yaw = extra turn). */
  const fw = new Vector3(), rt = new Vector3(), upv = new Vector3(), pos = new Vector3();
  function place3(o, d, a, h, yaw = 0, roll = 0) {
    at(d, a, h, pos, upv); tangent(d, fw);
    fw.sub(upv.clone().multiplyScalar(fw.dot(upv))).normalize();
    if (yaw) fw.applyAxisAngle(upv, yaw);
    rt.crossVectors(upv, fw).normalize();
    basis.makeBasis(rt, upv, fw); o.position.copy(pos); o.quaternion.setFromRotationMatrix(basis);
    if (roll) o.rotateZ(roll);
  }

  function setup() {
    if (v) return;
    const { m, G } = looks();
    v = new HDView({ bg: '#05060c', fog: .012, env: .45, sky: '#6080c0', ground: '#201018', amb: .3, fov: 70 }).lampLights(26);
    v.exposure = 1.0; v.bloom = .55;
    // racing through light: anamorphic streaks off the tube's lamps, a touch of grain
    v.film = { halation: .3, grain: 1.2, fringe: .02, streaks: .4, streakLength: .25 };
    head = spot('#e8f0ff', 60, 60, .45); v.scene.add(head, head.target); v.onTier(T => head.setTier(T));
    add = new Particles(v, { max: 500, additive: true }); smoke = new Particles(v, { max: 160, additive: false });
  }
  function buildWorld() {
    setup();
    const { m, G } = looks();
    if (world) { v.scene.remove(world); world.traverse(o => { if (o.userData.own) o.geometry.dispose(); }); freeCopies(world); }
    world = new Group(); v.scene.add(world);
    buildTrack();
    const tg = new TubeGeometry(curve, NF, R, 24, true);
    const tex = m.tube; for (const tx of [tex.map, tex.normalMap, tex.roughnessMap]) { tx.repeat.set(Math.round(LEN / 9), 3); tx.needsUpdate = true; }
    tubeMesh = new Mesh(tg, m.tube); tubeMesh.receiveShadow = true; tubeMesh.userData.own = true; world.add(tubeMesh);
    // neon strips along the tube at four angles (instanced short segments)
    const segN = Math.floor(LEN / 4), neon = [0, 1].map(k => new InstancedMesh(G.box, m.neon[k], segN * 2));
    for (let i = 0; i < segN; i++) for (let s = 0; s < 4; s++) {
      const a = Math.PI / 4 + s * Math.PI / 2; place3(mx, i * 4, a, .02); mx.scale.set(.18, .05, 3.6); mx.updateMatrix();
      neon[s % 2].setMatrixAt(i * 2 + (s >> 1), mx.matrix);
    }
    for (const nm of neon) { nm.frustumCulled = false; world.add(nm); }
    // light rings every 40 m: a glowing hoop + a real light when you're close
    const nR = Math.floor(LEN / 40); rings = new InstancedMesh(G.torus, m.ring, nR); ringSpots = [];
    const frames = new InstancedMesh(G.torus, m.ringFrame, nR);
    for (let i = 0; i < nR; i++) {
      const d = i * 40; at(d, 0, R, pos); tangent(d, fw); mx.position.copy(pos); mx.lookAt(pos.clone().add(fw)); mx.scale.setScalar(R - .15); mx.updateMatrix(); rings.setMatrixAt(i, mx.matrix);
      mx.scale.set(R + .1, R + .1, 3); mx.updateMatrix(); frames.setMatrixAt(i, mx.matrix);
      ringSpots.push({ x: pos.x, y: pos.y, z: pos.z, col: i % 3 ? '#ffd8a8' : '#a8d8ff', i: 60 });
    }
    rings.frustumCulled = frames.frustumCulled = false; world.add(rings, frames);
    // barriers, boost chevrons, missile crystals
    obs = []; pads = []; gems = [];
    for (let d = 140; d < LEN - 30; d += rnd(45, 85)) {
      const r = Math.random();
      if (r < .5) { const a = rnd(-Math.PI, Math.PI); obs.push({ d, a, w: rnd(.25, .45) }); if (Math.random() < .5) obs.push({ d: d + 2, a: a + Math.PI * rnd(.6, 1.4), w: rnd(.25, .4) }); }
      else if (r < .78) pads.push({ d, a: rnd(-Math.PI, Math.PI) });
      else { const a = rnd(-Math.PI, Math.PI); for (let k = -1; k <= 1; k++) gems.push({ d, a: a + k * .35, taken: 0 }); }
    }
    const ob = new InstancedMesh(rbox(1, 1, 1, .12), m.barrier, obs.length), obS = new InstancedMesh(G.box, m.hazard, obs.length);
    obs.forEach((o, i) => { place3(mx, o.d, o.a, .6); mx.scale.set(o.w * R * 1.8, 1.2, 1); mx.updateMatrix(); ob.setMatrixAt(i, mx.matrix); place3(mx, o.d, o.a, .6); mx.translateZ(-.52); mx.scale.set(o.w * R * 1.7, .25, .05); mx.updateMatrix(); obS.setMatrixAt(i, mx.matrix); });
    ob.castShadow = true; ob.frustumCulled = obS.frustumCulled = false; world.add(ob, obS);
    const pd = new InstancedMesh(G.plane, m.boost, pads.length * 3);
    pads.forEach((p, i) => { for (let k = 0; k < 3; k++) { place3(mx, p.d + k * 1.6, p.a, .04); mx.rotateX(-Math.PI / 2); mx.rotateZ(Math.PI / 4); mx.scale.set(1.3, 1.3, 1); mx.updateMatrix(); pd.setMatrixAt(i * 3 + k, mx.matrix); } });
    pd.frustumCulled = false; pd.renderOrder = 3; world.add(pd);
    for (const o of [frames, ob]) perCopy(o); rings = perCopy(rings);   // the big copies off screen aren't drawn (the small strips and pads cost more to check than to draw)
    gems.im = new InstancedMesh(G.gem, m.crystal, gems.length); gems.im.frustumCulled = false; world.add(gems.im);
    // cars on a staggered grid; you start fifth
    cars = [];
    for (let i = 0; i < CARS; i++) {
      const slot = i === 0 ? 4 : i <= 4 ? i - 1 : 5, row = slot >> 1;
      const c = { i, d: 20 - row * 7, a: (slot % 2 ? .3 : -.3), sp: 0, va: 0, line: (slot % 2 ? .3 : -.3), top: 54 + rnd(-3, 3) - (i ? 0 : 0), spin: 0, boost: 0, hit: 0, m: makeCar(i), lap: 0, done: 0 };
      world.add(c.m); cars.push(c);
    }
    me = cars[0]; missiles = []; built = true; v.warmed = false;
  }

  /* ---------- race logic ---------- */
  const ang = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  function crash(c, hard) {
    c.sp *= hard ? .35 : .7; c.spin = hard ? 1 : .4;
    at(c.d, c.a, .4, pos, upv);
    for (let i = 0; i < (hard ? 30 : 12); i++) add.emit({ x: pos.x, y: pos.y, z: pos.z, vx: rnd(-6, 6), vy: rnd(-6, 6), vz: rnd(-6, 6), life: rnd(.2, .6), size: .05, col: [6, 3, 1], drag: 2 });
    if (c === me) { shake = hard ? 1 : .5; haptic(hard ? 'heavy' : 'medium'); sfx(hard ? 70 : 110, .3, 'sawtooth', .07, -40); }
  }
  function fire() {
    if (ammo <= 0 || state !== 'race') return;
    ammo--; haptic('medium'); sfx(300, .25, 'sawtooth', .05, 600);
    // target: the nearest car ahead within 160 m
    let best = null, bd = 160; for (const c of cars) { if (c === me) continue; const gap = (c.d - me.d); if (gap > 2 && gap < bd) { bd = gap; best = c; } }
    missiles.push({ d: me.d + 2.5, a: me.a, sp: me.sp + 45, tgt: best, life: 5, m: missileMesh() });
  }
  function missileMesh() { const { m, G } = looks(), g = new Group(); g.add(P(G.cyl, m.missile, { sx: .14, sy: .9, sz: .14, rx: Math.PI / 2, cast: false }), P(G.cone, m.tail, { sx: .14, sy: .3, sz: .14, rx: Math.PI / 2, z: .6, cast: false })); world.add(g); return g; }
  function boom(c) {
    at(c.d, c.a, 1, pos, upv);
    for (let i = 0; i < 50; i++) add.emit({ x: pos.x, y: pos.y, z: pos.z, vx: rnd(-9, 9), vy: rnd(-9, 9), vz: rnd(-9, 9), life: rnd(.3, .8), size: rnd(.1, .3), grow: 1, col: [6, rnd(2, 3.5), .6], drag: 2.5 });
    for (let i = 0; i < 16; i++) smoke.emit({ x: pos.x, y: pos.y, z: pos.z, vx: rnd(-2, 2), vy: rnd(-2, 2), vz: rnd(-2, 2), life: rnd(1, 1.8), size: rnd(.6, 1.2), grow: 2, col: [.15, .14, .14], a: .6, drag: 1, fadeIn: 1 });
    c.sp *= .2; c.spin = 1.4; sfx(60, .5, 'sawtooth', .09, -30);
  }
  function drive(c, dt) {
    if (c.done) { c.sp *= Math.pow(.6, dt); c.d += c.sp * dt; return; }
    const ai = c !== me;
    let target = c.top + (c.boost > 0 ? 24 : 0);
    if (!ai && nitro.on && nitro.v > 0) { target += 16; nitro.v = Math.max(0, nitro.v - dt * .5); }
    if (ai) {
      // rubber band: the pack stays close to you
      const gap = c.d - me.d; target += clamp(-gap * .06, -8, 9);
      // pick a line around barriers ahead
      for (const o of obs) { const dd = o.d - (c.d % LEN); if (dd > 0 && dd < 30 && Math.abs(ang(o.a, c.line)) < o.w + .45) { c.line = o.a + (ang(c.line, o.a) > 0 ? 1 : -1) * (o.w + .7); break; } }
      if (Math.random() < dt * .3) c.line += rnd(-.6, .6);
      c.va += clamp(ang(c.line, c.a) * 3 - c.va, -4 * dt, 4 * dt);
    } else {
      c.va += ((steer * 2.3) - c.va) * Math.min(1, dt * 8);
    }
    if (c.spin > 0) { c.spin = Math.max(0, c.spin - dt); target *= .5; }
    c.sp += clamp(target - c.sp, -40 * dt, (c.sp < 20 ? 26 : 14) * dt);
    c.boost = Math.max(0, c.boost - dt);
    c.a += c.va * dt * clamp(c.sp / 30, .4, 1.2); c.a = ang(c.a, 0);
    const before = c.d; c.d += c.sp * dt;
    // barriers and pads (checked in the lap-relative distance)
    const ld0 = ((before % LEN) + LEN) % LEN, ld1 = ld0 + (c.d - before);
    for (const o of obs) { if (o.d >= ld0 && o.d < ld1 && Math.abs(ang(o.a, c.a)) < o.w + .12) crash(c, true); }
    for (const p of pads) { if (p.d >= ld0 - 2 && p.d < ld1 && Math.abs(ang(p.a, c.a)) < .22 && c.boost < 1.3) { c.boost = 1.6; if (c === me) { haptic('light'); sfx(440, .3, 'sawtooth', .05, 700); nitro.v = Math.min(1, nitro.v + .15); } } }
    if (c === me) for (const g of gems) { if (!g.taken && g.d >= ld0 - 1 && g.d < ld1 + 1 && Math.abs(ang(g.a, c.a)) < .2) { g.taken = 8; ammo = Math.min(3, ammo + 1); haptic('success'); sfx(880, .1, 'triangle', .05, 400); } }
    c.lap = Math.floor(c.d / LEN);
  }
  function update(dt) {
    t += dt; stT += dt; shake = Math.max(0, shake - dt * 2);
    if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    for (const g of gems) if (g.taken) g.taken = Math.max(0, g.taken - dt);
    if (state === 'count') { if (stT >= 3) { state = 'race'; stT = 0; msg = { txt: 'GO!', l: .8 }; sfx(880, .4, 'square', .05); haptic('heavy'); } else if (Math.floor(stT) !== Math.floor(stT - dt)) sfx(440, .15, 'square', .04); fx(dt); return; }
    if (keys.has('ArrowLeft') || keys.has('a')) steer = -1; else if (keys.has('ArrowRight') || keys.has('d')) steer = 1; else if (!fingers.steer) steer = 0;
    nitro.on = keys.has('Shift') || !!(fingers.right && fingers.right.hold);
    for (const c of cars) drive(c, dt);
    // car-to-car bumps
    for (let i = 0; i < CARS; i++) for (let j = i + 1; j < CARS; j++) {
      const A = cars[i], Bc = cars[j], dd = A.d - Bc.d, da = ang(A.a, Bc.a);
      if (Math.abs(dd) < 3.8 && Math.abs(da) * R < 1.9) { const push = (1.9 - Math.abs(da) * R) / R * .5 * Math.sign(da || 1); A.a += push; Bc.a -= push; const back = dd > 0 ? Bc : A; back.sp *= Math.pow(.985, dt * 60); if (A === me || Bc === me) { haptic('light'); if (Math.random() < .2) sfx(150, .05, 'square', .03); } }
    }
    // missiles home in on their target
    for (const ms of missiles) {
      ms.life -= dt; ms.sp += 30 * dt; ms.d += ms.sp * dt;
      if (ms.tgt) { ms.a += clamp(ang(ms.tgt.a, ms.a), -3 * dt, 3 * dt); if (ms.d >= ms.tgt.d - .5 && Math.abs(ang(ms.tgt.a, ms.a)) < .35) { boom(ms.tgt); ms.life = 0; takedowns++; score += 150; api.score(score); msg = { txt: `${NAMES[ms.tgt.i]} TAKEN DOWN +150`, l: 1.5 }; haptic('success'); } }
      at(ms.d, ms.a, .9, pos, upv); smoke.emit({ x: pos.x, y: pos.y, z: pos.z, life: .6, size: .2, grow: 2, col: [.7, .7, .7], a: .3 }); add.emit({ x: pos.x, y: pos.y, z: pos.z, life: .1, size: .15, col: [6, 3, 1] });
    }
    for (const ms of missiles) if (ms.life <= 0) world.remove(ms.m);
    missiles = missiles.filter(ms => ms.life > 0);
    // standings, score by distance
    const order = [...cars].sort((a, b) => b.d - a.d); const np = order.indexOf(me) + 1;
    if (place && np < place && state === 'race') { haptic('light'); sfx(660, .08, 'triangle', .04, 200); }
    place = np;
    const distPts = Math.floor(me.d / 10);
    if (distPts > (me.pts || 0)) { score += distPts - (me.pts || 0); me.pts = distPts; api.score(score); }
    if (me.lap > (me.lapSeen || 0) && me.lap < LAPS) { me.lapSeen = me.lap; msg = { txt: me.lap === LAPS - 1 ? 'FINAL LAP' : `LAP ${me.lap + 1}`, l: 1.4 }; sfx(660, .2, 'triangle', .05, 300); }
    for (const c of cars) if (!c.done && c.d >= LAPS * LEN) c.done = 1 + cars.filter(x => x.done).length;
    if (state === 'race' && me.done) {
      state = 'fin'; stT = 0; const bonus = [1000, 700, 450, 250, 120, 50][me.done - 1]; score += bonus; api.score(score);
      msg = { txt: me.done === 1 ? '1ST PLACE!' : `${me.done}${['', 'ST', 'ND', 'RD'][me.done] || 'TH'} PLACE`, sub: `+${bonus}`, l: 3 }; haptic('success'); sfx(520, .3, 'triangle', .05, 520);
    }
    if (state === 'fin' && stT > 2.8) { state = 'over'; api.over(); }
    fx(dt);
  }
  function fx(dt) {
    add.update(dt); smoke.update(dt);
    // exhaust flames + speed streaks
    for (const c of cars) {
      if (Math.random() < dt * (c.boost > 0 || (c === me && nitro.on && nitro.v > 0) ? 60 : 18)) { at(c.d - 2.1, c.a, .6, pos, upv); add.emit({ x: pos.x, y: pos.y, z: pos.z, life: .18, size: .25, col: c.boost > 0 ? [1, 3, 6] : [5, 2.4, .8], ease: 2 }); }
    }
    if (me.sp > 30 && Math.random() < dt * 40) { at(me.d + rnd(15, 40), rnd(-Math.PI, Math.PI), rnd(.1, 2), pos, upv); tangent(me.d, fw); add.emit({ x: pos.x, y: pos.y, z: pos.z, vx: -fw.x * 30, vy: -fw.y * 30, vz: -fw.z * 30, life: .5, size: .05, col: [1.2, 1.4, 2], a: .7 }); }
  }

  /* ---------- drawing ---------- */
  const camPos = new Vector3(), camLook = new Vector3(), camUp = new Vector3(0, 1, 0);
  function scene3d() {
    for (const c of cars) {
      const o = c.m; place3(o, c.d, c.a, 0, c.spin * Math.sin(t * 20) * .6 + c.va * .08, c.va * -.05);
      for (const w of o.userData.wheels) w.rotation.x += c.sp * .016;
      o.userData.flame.visible = c.boost > 0 || (c === me && nitro.on && nitro.v > 0) || c.sp > 45;
      o.userData.flame.scale.z = .6 + Math.random() * .6;
    }
    gems.forEach((g, i) => { place3(mx, g.d, g.a, 1, t * 3); mx.scale.setScalar(g.taken ? 0 : .4); mx.updateMatrix(); gems.im.setMatrixAt(i, mx.matrix); });
    gems.im.instanceMatrix.needsUpdate = true;
    for (const ms of missiles) place3(ms.m, ms.d, ms.a, .9);
    // chase camera: behind and above the car, rolling with it round the tube
    at(me.d - 7.5, me.a, 2.7, pos, upv); const sh = shake * .25;
    const snap = !camPos.lengthSq() || camPos.distanceToSquared(pos) > 100;   // first frame, respawn or a long gap
    camPos.lerp(pos, snap ? 1 : .35); camUp.lerp(upv, snap ? 1 : .25).normalize();
    at(me.d + 12, me.a, 1.1, camLook);
    v.cam.position.set(camPos.x + rnd(-sh, sh), camPos.y + rnd(-sh, sh), camPos.z + rnd(-sh, sh)); v.cam.up.copy(camUp); v.cam.lookAt(camLook);
    const fov = 68 + clamp((me.sp - 40) * .5, 0, 18); if (Math.abs(v.cam.fov - fov) > .2) { v.cam.fov += (fov - v.cam.fov) * .2; v.cam.updateProjectionMatrix(); }
    // headlights: a shadow-casting spot just ahead of the car
    at(me.d + 1.5, me.a, 1.6, pos); head.position.copy(pos); at(me.d + 25, me.a, .2, pos); head.target.position.copy(pos); head.target.updateMatrixWorld();
    v.placeLamps(ringSpots, v.cam.position.x, v.cam.position.y, v.cam.position.z, t);
    v.hurt = shake * .5;
  }
  function hud(c) {
    const u = Math.min(W, H) / 300; c.save(); c.textBaseline = 'middle';
    const glass = (x, y, w, h) => { c.fillStyle = '#05070cb0'; c.beginPath(); c.roundRect(x, y, w, h, Math.min(h / 2, 14 * u)); c.fill(); c.strokeStyle = '#ffffff22'; c.lineWidth = 1; c.stroke(); };
    // position + lap (top left)
    glass(8 * u, 8 * u, 84 * u, 40 * u);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = `800 ${22 * u}px Rubik, sans-serif`; c.fillText(String(place || CARS), 16 * u, 26 * u);
    c.font = `700 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#9fb4d8'; c.fillText(`/${CARS}`, (30 + (place > 9 ? 12 : 0)) * u, 30 * u);
    c.fillStyle = '#7cc4ff'; c.fillText(`LAP ${Math.min(LAPS, me.lap + 1)}/${LAPS}`, 46 * u, 26 * u);
    // standings strip
    const order = [...cars].sort((a, b) => b.d - a.d);
    order.forEach((cc, i) => { c.fillStyle = COLS[cc.i]; c.fillRect(16 * u + i * 12 * u, 40 * u, 9 * u, 3 * u); if (cc === me) { c.fillStyle = '#fff'; c.fillRect(16 * u + i * 12 * u, 44 * u, 9 * u, 1.5 * u); } });
    // speed + nitro + missiles (bottom)
    const by = H - 26 * u; glass(W / 2 - 60 * u, by - 18 * u, 120 * u, 36 * u);
    c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = `800 ${18 * u}px Rubik, sans-serif`; c.fillText(Math.round(me.sp * 3.6), W / 2 - 14 * u, by - 3 * u);
    c.font = `700 ${6.5 * u}px Rubik, sans-serif`; c.fillStyle = '#9fb4d8'; c.fillText('KM/H', W / 2 - 14 * u, by + 10 * u);
    c.fillStyle = '#ffffff1a'; c.fillRect(W / 2 + 14 * u, by - 9 * u, 38 * u, 4 * u); c.fillStyle = '#20e0ff'; c.fillRect(W / 2 + 14 * u, by - 9 * u, 38 * u * nitro.v, 4 * u);
    for (let i = 0; i < 3; i++) { c.fillStyle = i < ammo ? '#ffd040' : '#ffffff22'; c.beginPath(); c.moveTo(W / 2 + (18 + i * 12) * u, by + 8 * u); c.lineTo(W / 2 + (22 + i * 12) * u, by); c.lineTo(W / 2 + (26 + i * 12) * u, by + 8 * u); c.fill(); }
    // thumb guides
    if (fingers.steer) { const f = fingers.steer; c.strokeStyle = '#ffffff40'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(f.ax - 40 * u, f.ay); c.lineTo(f.ax + 40 * u, f.ay); c.stroke(); c.fillStyle = '#ffffff50'; c.beginPath(); c.arc(f.ax + clamp(f.x - f.ax, -40 * u, 40 * u), f.ay, 9 * u, 0, 7); c.fill(); }
    if (fingers.right) { const f = fingers.right; c.strokeStyle = f.hold ? '#20e0ffa0' : '#ffffff40'; c.lineWidth = 2 * u; c.beginPath(); c.arc(f.x, f.y, 16 * u, 0, 7); c.stroke(); }
    // countdown / messages
    if (state === 'count') { const n = 3 - Math.floor(stT); c.fillStyle = '#fff'; c.font = `800 ${60 * u}px Rubik, sans-serif`; c.globalAlpha = 1 - (stT % 1) * .6; c.fillText(String(n), W / 2, H * .38); c.globalAlpha = 1; c.font = `600 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#f2f5fbcc'; c.fillText('Drag left/right to steer · tap to fire · 2nd thumb: hold for nitro', W / 2, H * .55); }
    if (msg) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = '#fff'; c.font = `800 ${20 * u}px Rubik, sans-serif`; c.fillText(msg.txt, W / 2, H * .3); if (msg.sub) { c.fillStyle = '#ffd040'; c.font = `800 ${12 * u}px Rubik, sans-serif`; c.fillText(msg.sub, W / 2, H * .3 + 18 * u); } c.globalAlpha = 1; }
    c.restore();
  }

  const self = {
    reset() {
      t = 0; score = 0; state = 'count'; stT = 0; msg = null; steer = 0; keys = new Set(); fingers = {}; nitro = { v: .3, on: false }; ammo = 1; takedowns = 0; place = 0; shake = 0;
      buildWorld(); camPos.set(0, 0, 0);
    },
    resize(w, h) { W = w; H = h; },
    update,
    fx(dt) { add.update(dt); smoke.update(dt); },
    draw(c) { if (!built) self.reset(); scene3d(); v.render(c, W, H); hud(c); },
    // Touch: a finger on the left half (or the only finger) steers by sliding left/right. A finger on
    // the right half while steering is the action thumb: tap fires, hold uses nitro. A quick tap with
    // the steering finger also fires, so it plays with one thumb.
    down(x, y, id = 0) {
      const f = { id, ax: x, ay: y, x, y, t0: performance.now(), moved: 0, hold: false };
      if (!fingers.steer && (x < W / 2 || !fingers.right)) fingers.steer = f; else if (!fingers.right) fingers.right = f;
    },
    move(x, y, p, id = 0) {
      if (!p) return; const f = fingers.steer?.id === id ? fingers.steer : fingers.right?.id === id ? fingers.right : null; if (!f) return;
      f.x = x; f.y = y; f.moved = Math.max(f.moved, Math.abs(x - f.ax) + Math.abs(y - f.ay));
      if (f === fingers.steer) steer = clamp((x - f.ax) / (W * .16), -1, 1);
    },
    up(x, y, id = 0) {
      const f = fingers.steer?.id === id ? fingers.steer : fingers.right?.id === id ? fingers.right : null; if (!f) return;
      const quick = performance.now() - f.t0 < 250 && f.moved < 10;
      if (f === fingers.steer) { fingers.steer = null; steer = 0; } else fingers.right = null;
      if (quick) fire();
    },
    key(k, d) { if (d) keys.add(k); else keys.delete(k); if (d && (k === ' ' || k === 'ArrowUp')) fire(); },
    get dbg() { return { cars, me, LEN }; },
  };
  // the action thumb counts as "holding" after a moment
  const _upd = self.update; self.update = dt => { if (fingers.right) fingers.right.hold = performance.now() - fingers.right.t0 > 220; _upd(dt); };
  return self;
}

export default {
  id: 'gravity-grip',
  title: 'Gravity Grip',
  tag: 'Next Gen · Racing',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 1200, reward: 25,
  hint: 'Race five rivals round a giant tube: steer and you drive up the walls and over the ceiling. Drag left/right to steer, tap to fire missiles from the crystals. Two thumbs: left steers, right taps to fire and holds for nitro. Hit the blue chevrons, dodge the barriers.',
  traits: ['theme:scifi'],
  make,
};
