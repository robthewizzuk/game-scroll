import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { HDView, Particles, pbr, rbox, surface, speckle, spot, THREE } = gs.hd;
const { perCopy, freeCopies } = gs.props;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, CatmullRomCurve3, BufferGeometry, BufferAttribute, CylinderGeometry, BoxGeometry, PlaneGeometry, Color } = THREE;

// Neon Drift: a night-time street circuit, wet tarmac shining with neon. The car always has its foot
// down; you steer, and steering hard at speed (or holding the handbrake thumb) kicks the tail out.
// Hold a drift to build points and a multiplier, straighten up cleanly to bank them. Touch a wall
// mid-drift and the combo is lost. Checkpoint gates add time; the run ends when the clock hits zero.
// One thumb: drag left/right to steer. Two thumbs: right thumb holds the handbrake.
let W = 300, H = 300;
const RW = 7, N = 700;          // road half-width (m), track samples

let MT = null;
function looks() {
  if (MT) return MT;
  const road = surface(512, ({ col, h, r, size: S }) => {
    col.fillStyle = '#1b1d22'; col.fillRect(0, 0, S, S); speckle(col, S, 4000, '#3a3d44', 1.2, .5); speckle(col, S, 1500, '#000', 1.5, .5);
    r.fillStyle = '#7a7a7a'; r.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) { const x = rnd(0, S), y = rnd(0, S), rr = rnd(20, 70); const g = r.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, '#080808'); g.addColorStop(1, '#7a7a7a00'); r.fillStyle = g; r.beginPath(); r.arc(x, y, rr, 0, 7); r.fill(); }   // puddles: mirror-smooth
    h.fillStyle = '#909090'; speckle(h, S, 3000, '#fff', 1, .4);
    col.fillStyle = '#d8d8d0'; for (let y = 0; y < S; y += 128) col.fillRect(S / 2 - 4, y, 8, 64);   // centre dashes
    col.fillStyle = '#c8c8c0'; col.fillRect(10, 0, 6, S); col.fillRect(S - 16, 0, 6, S);            // edge lines
  }, { strength: 1.5 });
  const windows = surface(256, ({ col, size: S }) => {
    col.fillStyle = '#000'; col.fillRect(0, 0, S, S);
    for (let y = 8; y < S; y += 24) for (let x = 8; x < S; x += 22) {
      if (Math.random() < .55) continue; const k = Math.random();
      col.fillStyle = k < .5 ? '#ffd9a0' : k < .75 ? '#a8d8ff' : k < .9 ? '#ff7ac8' : '#ffffff'; col.globalAlpha = rnd(.25, 1); col.fillRect(x, y, 13, 14);
    }
    col.globalAlpha = 1;
  });
  const wallTex = surface(256, ({ col, h, size: S }) => { col.fillStyle = '#2b2f38'; col.fillRect(0, 0, S, S); speckle(col, S, 900, '#111', 2, .4); h.fillStyle = '#000'; for (let x = 0; x < S; x += 64) h.fillRect(x, 0, 3, S); });
  const tower = pbr('#20232a', { tex: wallTex.repeat(1, 3), rough: .5, metal: .4 });
  const win = windows.repeat(1, 3); tower.emissiveMap = win.map; tower.emissive = new Color('#ffffff'); tower.emissiveIntensity = 1.3;
  MT = {
    road: pbr('#ffffff', { tex: road, rough: 1, metal: .35 }),
    tower, roof: pbr('#14161b', { rough: .7 }),
    neon: ['#ff2fa0', '#18e4ff', '#b65cff', '#ffcf3a'].map(c => pbr(c, { glow: 2.2 })),
    barrier: pbr('#d8dce4', { rough: .35, metal: .7, clear: .5 }),
    gate: pbr('#18e4ff', { glow: 2.5 }), gateFrame: pbr('#30343c', { rough: .3, metal: .9 }),
    paint: pbr('#ff2a5a', { rough: .25, metal: .15, clear: 1 }), carbon: pbr('#15171b', { rough: .35, metal: .5, clear: .5 }),
    glass: pbr('#0b1118', { rough: .05, metal: .8, clear: 1 }), tyre: pbr('#111', { rough: .6 }), rim: pbr('#d0d4dc', { rough: .2, metal: 1 }),
    head: pbr('#ffffff', { glow: 4 }), tail: pbr('#ff1830', { glow: 3 }), under: pbr('#ff2fa0', { glow: 2.5 }),
    pole: pbr('#3a3e46', { rough: .4, metal: .8 }), lamp: pbr('#ffe2b0', { glow: 4 }),
  };
  return MT;
}
const B = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new Mesh(rbox(w, h, d, Math.min(w, h, d) * .3), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
function makeCar() {
  const m = looks(), g = new Group(), body = new Group(); g.add(body);
  body.add(B(1.9, .5, 4.2, m.paint, 0, .55), B(1.5, .42, 2, m.glass, 0, .98, -.2), B(2, .1, .5, m.carbon, 0, .5, 2.15), B(1.9, .12, .5, m.carbon, 0, 1.05, -1.95));
  body.add(B(1.92, .06, 4.22, m.carbon, 0, .34));
  for (const x of [-.6, .6]) { body.add(B(.36, .1, .06, m.head, x, .66, 2.1)); body.add(B(.42, .1, .06, m.tail, x, .68, -2.1)); }
  const glow = new Mesh(new PlaneGeometry(1.6, 3.6), m.under); glow.rotation.x = -Math.PI / 2; glow.position.y = .06; body.add(glow);
  g.userData.wheels = [];
  for (const x of [-1, 1]) for (const z of [-1.35, 1.35]) {
    const w = new Group(); w.position.set(x * .98, .36, z); g.add(w);
    const ty = new Mesh(new CylinderGeometry(.36, .36, .32, 20), m.tyre); ty.rotation.z = Math.PI / 2; ty.castShadow = true;
    const ri = new Mesh(new CylinderGeometry(.22, .22, .34, 14), m.rim); ri.rotation.z = Math.PI / 2;
    w.add(ty, ri); g.userData.wheels.push(w);
  }
  g.userData.body = body; return g;
}

function make(api) {
  let v, car, head, smoke, spark, rain, PT, RT, LEN, gates, lampSpots, built;
  let stuckT = 0, pos, vel, hd, steer, brake, ci, lap, score, pending, mult, driftT, cleanT, time, t, msg, fingers, keys, shake, gateNext, best;
  const tmp = new Vector3(), mx = new Object3D(), camPos = new Vector3(), camLook = new Vector3();

  function buildTrack() {
    const pts = [], n = 10;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = rnd(80, 125) * (i % 2 ? .8 : 1); pts.push(new Vector3(Math.cos(a) * r * 1.35, 0, Math.sin(a) * r)); }
    const curve = new CatmullRomCurve3(pts, true, 'centripetal'); LEN = curve.getLength();
    PT = []; RT = [];
    for (let i = 0; i < N; i++) { const p = curve.getPointAt(i / N), tg = curve.getTangentAt(i / N); PT.push(p); RT.push(new Vector3(-tg.z, 0, tg.x).normalize()); }
  }
  function setup() {
    v = new HDView({ bg: '#07060f', fog: .016, env: .5, sky: '#4a3a8a', ground: '#120a1a', amb: .55, fov: 66 }).lampLights(24);
    v.exposure = 1.05; v.bloom = .85;
    // rain at night: black wet road that holds the neon, haze round the signs, flare, grain and the eye adapting (its own purple sky kept)
    v.look('night rain', { bg: '#07060f', sky: '#4a3a8a', ground: '#120a1a', amb: .55, env: .5, exposure: 1, bloom: .7, glare: .3, air: { haze: .008, colour: '#0c0a16', sunColour: '#1a1530', mist: 0, clouds: 0, wet: .35 }, eye: { amount: .3, min: .85, max: 1.2, speed: .7 }, flare: { strength: .3, threshold: .55, dirt: .4, tint: [1, .85, .7] }, film: { halation: .3, grain: 1.6, fringe: .02 } });
    head = spot('#fff4e0', 70, 45, .55); v.scene.add(head, head.target); v.onTier(T => head.setTier(T));
    smoke = new Particles(v, { max: 260, additive: false }); spark = new Particles(v, { max: 300, additive: true }); rain = new Particles(v, { max: 400, additive: true });
  }
  function buildWorld() {
    setup(); const m = looks();
    if (built) { v.scene.remove(built); freeCopies(built); }
    built = new Group(); v.scene.add(built); buildTrack();
    // road ribbon
    const pos3 = new Float32Array((N + 1) * 2 * 3), uv = new Float32Array((N + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= N; i++) {
      const p = PT[i % N], r = RT[i % N], d = i / N * LEN / 14;
      pos3.set([p.x - r.x * RW, 0, p.z - r.z * RW, p.x + r.x * RW, 0, p.z + r.z * RW], i * 6); uv.set([0, d, 1, d], i * 4);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos3, 3)); g.setAttribute('uv', new BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const roadM = new Mesh(g, m.road); roadM.receiveShadow = true; built.add(roadM);
    const ground = new Mesh(new PlaneGeometry(800, 800), pbr('#0c0d11', { rough: .9 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.05; ground.receiveShadow = true; built.add(ground);
    // barriers + neon strips along both edges
    const nb = Math.floor(N / 2), bar = new InstancedMesh(new BoxGeometry(1, 1, 1), m.barrier, nb * 2), neon = [0, 1].map(k => new InstancedMesh(new BoxGeometry(1, 1, 1), m.neon[k], nb));
    for (let i = 0; i < nb; i++) for (const s of [-1, 1]) {
      const a = PT[i * 2], b = PT[(i * 2 + 2) % N], r = RT[i * 2], len = a.distanceTo(b) + .1;
      mx.position.set((a.x + b.x) / 2 + r.x * s * (RW + .4), .45, (a.z + b.z) / 2 + r.z * s * (RW + .4)); mx.lookAt(b.x + r.x * s * (RW + .4), .45, b.z + r.z * s * (RW + .4));
      mx.scale.set(.35, .9, len); mx.updateMatrix(); bar.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), mx.matrix);
      mx.position.y = .95; mx.scale.set(.12, .08, len); mx.updateMatrix(); neon[s > 0 ? 1 : 0].setMatrixAt(i, mx.matrix);
    }
    bar.castShadow = bar.receiveShadow = true; built.add(bar, ...neon);
    // towers: instanced, both sides, with lit windows; neon signs on some
    const nT = 180, tw = new InstancedMesh(rbox(1, 1, 1, .02), m.tower, nT), signs = [0, 1, 2, 3].map(k => new InstancedMesh(new BoxGeometry(1, 1, 1), m.neon[k], 30));
    const sc = [0, 0, 0, 0];
    for (let i = 0; i < nT; i++) {
      const k = Math.floor(i / nT * N), s = i % 2 ? 1 : -1, off = RW + rnd(10, 34), p = PT[k], r = RT[k];
      const w = rnd(10, 22), d = rnd(10, 22), hgt = rnd(14, 70);
      const cx = p.x + r.x * s * (off + w / 2), cz = p.z + r.z * s * (off + w / 2), clear = RW + 4 + Math.max(w, d) * .75;
      if (PT.some(q => (q.x - cx) ** 2 + (q.z - cz) ** 2 < clear * clear)) { mx.scale.set(0, 0, 0); mx.updateMatrix(); tw.setMatrixAt(i, mx.matrix); continue; }   // would poke onto the road on a bend
      mx.position.set(p.x + r.x * s * (off + w / 2), hgt / 2, p.z + r.z * s * (off + w / 2)); mx.rotation.set(0, Math.atan2(r.x, r.z), 0); mx.scale.set(w, hgt, d); mx.updateMatrix(); tw.setMatrixAt(i, mx.matrix);
      if (Math.random() < .5) { const q = (Math.random() * 4) | 0; if (sc[q] < 30) { mx.position.set(p.x + r.x * s * (off - .2), rnd(5, Math.min(hgt - 2, 20)), p.z + r.z * s * (off - .2)); mx.scale.set(rnd(4, 9), rnd(.4, 1.6), .25); mx.updateMatrix(); signs[q].setMatrixAt(sc[q]++, mx.matrix); } }
    }
    signs.forEach((sg, q) => { sg.count = sc[q]; }); tw.castShadow = true; tw.receiveShadow = true; built.add(tw, ...signs);
    for (const o of [bar, ...neon, tw, ...signs]) o.frustumCulled = false;
    // street lamps: a real light pool along the road
    lampSpots = []; const poles = new InstancedMesh(new CylinderGeometry(.12, .16, 1, 8), m.pole, Math.ceil(N / 18)), bulbs = new InstancedMesh(new BoxGeometry(1, 1, 1), m.lamp, Math.ceil(N / 18)); let pc = 0;
    for (let i = 0; i < N; i += 18) {
      const s = (i / 18) % 2 ? 1 : -1, p = PT[i], r = RT[i], x = p.x + r.x * s * (RW + 1.4), z = p.z + r.z * s * (RW + 1.4);
      mx.position.set(x, 3.5, z); mx.rotation.set(0, 0, 0); mx.scale.set(1, 7, 1); mx.updateMatrix(); poles.setMatrixAt(pc, mx.matrix);
      mx.position.set(x - r.x * s * 1, 7, z - r.z * s * 1); mx.scale.set(.5, .15, 1.2); mx.updateMatrix(); bulbs.setMatrixAt(pc++, mx.matrix);
      lampSpots.push({ x: x - r.x * s, y: 6.6, z: z - r.z * s, col: (i / 18) % 3 ? '#ffd8a8' : '#ff8ad8', i: 40 });
    }
    poles.count = bulbs.count = pc; poles.castShadow = true; poles.frustumCulled = bulbs.frustumCulled = false; built.add(poles, bulbs);
    for (const o of [bar, ...neon, tw, ...signs, poles, bulbs]) perCopy(o);   // the copies off screen aren't drawn
    // checkpoint gates
    gates = [];
    for (let k = 1; k <= 6; k++) {
      const i = Math.floor(k / 6 * N) % N, p = PT[i], r = RT[i], gg = new Group();
      for (const s of [-1, 1]) { const post = new Mesh(new BoxGeometry(.4, 6, .4), m.gateFrame); post.position.set(r.x * s * (RW + .6), 3, r.z * s * (RW + .6)); post.castShadow = true; gg.add(post); }
      const bar2 = new Mesh(new BoxGeometry(1, .3, .3), m.gate); bar2.scale.x = RW * 2 + 1.6; bar2.position.y = 6; bar2.rotation.y = Math.atan2(-r.z, r.x); gg.add(bar2);
      gg.position.set(p.x, 0, p.z); built.add(gg); gates.push({ i, g: gg });
    }
    car = car || makeCar(); built.add(car); v.warmed = false;
  }
  const lateral = (i) => tmp.copy(pos).sub(PT[i]).dot(RT[i]);
  function nearest() {
    let bi = ci, bd = 1e9;
    for (let k = -6; k < 24; k++) { const i = ((ci + k) % N + N) % N, d = (pos.x - PT[i].x) ** 2 + (pos.z - PT[i].z) ** 2; if (d < bd) { bd = d; bi = i; } }
    if (bi < ci - N / 2) lap++; if (bi > ci + N / 2) lap--;
    ci = bi;
  }
  function bank() {
    if (pending < 5) { pending = 0; mult = 1; return; }
    const pts = Math.round(pending * mult); score += pts; api.score(score);
    msg = { txt: `+${pts}`, sub: mult > 1 ? `DRIFT x${mult.toFixed(1)}` : 'DRIFT', l: 1.2, col: '#18e4ff' };
    haptic('success'); sfx(660 + Math.min(mult, 5) * 80, .12, 'triangle', .05, 300);
    pending = 0; mult = 1;
  }
  function update(dt) {
    t += dt; time -= dt; shake = Math.max(0, shake - dt * 2);
    if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    if (t < 2) { time += dt; return fxUpdate(dt); }        // a moment to get ready
    // input
    const k = keys; let s = fingers.steer ? steer : 0;
    if (k.has('ArrowLeft') || k.has('a')) s = -1; else if (k.has('ArrowRight') || k.has('d')) s = 1;
    brake = !!fingers.right || k.has(' ') || k.has('Shift');
    // forward / sideways split
    const fx = Math.sin(hd), fz = Math.cos(hd), sp = Math.hypot(vel.x, vel.z);
    let vf = vel.x * fx + vel.z * fz, vs = vel.x * fz - vel.z * fx;
    vf += (brake ? 6 : 20) * dt; vf = Math.min(vf, 44); vf *= Math.exp(-(brake ? .5 : .08) * dt);
    const hard = Math.abs(s) * clamp(sp / 32, 0, 1);
    const grip = brake ? .9 : clamp(7 - hard * 4.5, 1.6, 7);
    vs *= Math.exp(-grip * dt);
    // steering: turns faster at speed and when the tail is out
    hd -= s * dt * clamp(sp / 10, .35, 1) * (1.6 + (brake ? 1 : 0) + Math.abs(vs) * .03);
    vel.set(fx * vf + fz * vs, 0, fz * vf - fx * vs);
    pos.addScaledVector(vel, dt); nearest();
    // walls
    const lat = lateral(ci);
    if (Math.abs(lat) > RW - 1.1) {
      const r = RT[ci], sg = Math.sign(lat), into = vel.x * r.x * sg + vel.z * r.z * sg;
      pos.addScaledVector(r, -sg * (Math.abs(lat) - (RW - 1.1)));
      if (into > 0) { vel.addScaledVector(r, -sg * into * 1.5); vel.multiplyScalar(.82); }
      if (into > 3) {
        shake = Math.min(1, into / 12); haptic(into > 9 ? 'heavy' : 'medium'); sfx(90, .2, 'sawtooth', .06, -40);
        for (let i = 0; i < 20; i++) spark.emit({ x: pos.x + r.x * sg * 1, y: .6, z: pos.z + r.z * sg * 1, vx: rnd(-6, 6), vy: rnd(1, 6), vz: rnd(-6, 6), life: rnd(.2, .5), size: .08, col: [5, 2.5, 1], drag: 2, grav: 9, floor: 0 });
        if (pending > 0) { msg = { txt: 'COMBO LOST', l: 1, col: '#ff5a7a' }; pending = 0; mult = 1; }
        driftT = 0;
      }
    }
    // stuck against a wall: put the car back on the road facing the right way
    stuckT = sp < 5 ? stuckT + dt : 0;
    if (stuckT > 1.2) { stuckT = 0; pos.copy(PT[ci]); const j = (ci + 1) % N; hd = Math.atan2(PT[j].x - PT[ci].x, PT[j].z - PT[ci].z); vel.set(Math.sin(hd) * 10, 0, Math.cos(hd) * 10); msg = { txt: 'RESET', l: .8, col: '#fff' }; }
    // drift scoring
    const ang = Math.abs(Math.atan2(vs, Math.max(1, vf)));
    if (ang > .18 && sp > 13) {
      driftT += dt; cleanT = 0; pending += ang * sp * dt * 6; mult = Math.min(5, 1 + driftT * .5);
      if ((t * 12 | 0) !== ((t - dt) * 12 | 0)) haptic(ang > .5 ? 'medium' : 'tick');
      if (Math.random() < .6) for (const z of [-1.35]) for (const x of [-1, 1]) { const wx = pos.x + fx * z + fz * x, wz = pos.z + fz * z - fx * x; smoke.emit({ x: wx, y: .3, z: wz, vx: rnd(-1, 1), vy: rnd(.5, 1.5), vz: rnd(-1, 1), life: rnd(.8, 1.4), size: rnd(.8, 1.4), grow: 2.5, col: [.55, .5, .6], a: .35, drag: 1, fadeIn: 1 }); }
    } else if (pending > 0) { cleanT += dt; if (cleanT > .35) { bank(); driftT = 0; } }
    // gates
    const g = gates[gateNext];
    if (g && ((ci - g.i + N) % N) < 30 && ((ci - g.i + N) % N) >= 0) {
      gateNext = (gateNext + 1) % gates.length; const add = Math.max(4, 9 - lap * .8); time += add;
      if (!msg) msg = { txt: `+${add.toFixed(1)}s`, l: 1, col: '#ffcf3a' }; sfx(880, .1, 'square', .04, 200); haptic('light');
    }
    if (time <= 0) { time = 0; bank(); sounds('over'); return api.over(); }
    car.userData.lastS = s;
    fxUpdate(dt);
  }
  function sounds(k) { if (k === 'over') sfx(220, .5, 'triangle', .06, -120); }
  function fxUpdate(dt) {
    smoke.update(dt); spark.update(dt);
    for (let i = 0; i < 6; i++) rain.emit({ x: v.cam.position.x + rnd(-14, 14), y: v.cam.position.y + rnd(2, 9), z: v.cam.position.z + rnd(-14, 14), vy: -24, vx: -vel.x * .3, vz: -vel.z * .3, life: .45, size: .035, col: [.5, .6, .9], a: .6 });
    rain.update(dt);
  }
  function draw(c) {
    if (!built) self.reset();
    // car
    car.position.copy(pos); car.rotation.y = hd;
    const vs = vel.x * Math.cos(hd) - vel.z * Math.sin(hd);
    car.userData.body.rotation.z = clamp(vs * .012, -.08, .08); car.userData.body.rotation.x = brake ? .02 : -.01;
    const sp = Math.hypot(vel.x, vel.z);
    car.userData.wheels.forEach((w, i) => { w.rotation.x += sp * .03; if (i % 2) w.rotation.y = -(car.userData.lastS || 0) * .45; });
    // chase cam: behind the direction of travel, swung a bit towards where the nose points
    const tx = sp > 3 ? vel.x / sp : Math.sin(hd), tz = sp > 3 ? vel.z / sp : Math.cos(hd);
    const bx = tx * .6 + Math.sin(hd) * .4, bz = tz * .6 + Math.cos(hd) * .4, bl = Math.hypot(bx, bz) || 1, sh = shake * .3;
    tmp.set(pos.x - bx / bl * 8.5, 3.6, pos.z - bz / bl * 8.5);
    if (!camPos.lengthSq()) camPos.copy(tmp); camPos.lerp(tmp, .12);
    camLook.set(pos.x + bx / bl * 6, 1, pos.z + bz / bl * 6);
    v.cam.position.set(camPos.x + rnd(-sh, sh), camPos.y + rnd(-sh, sh), camPos.z); v.cam.lookAt(camLook);
    const fov = 64 + clamp((sp - 25) * .5, 0, 12); if (Math.abs(v.cam.fov - fov) > .2) { v.cam.fov += (fov - v.cam.fov) * .1; v.cam.updateProjectionMatrix(); }
    head.position.set(pos.x + Math.sin(hd) * 2, 1.6, pos.z + Math.cos(hd) * 2); head.target.position.set(pos.x + Math.sin(hd) * 24, 0, pos.z + Math.cos(hd) * 24); head.target.updateMatrixWorld();
    v.placeLamps(lampSpots, pos.x, 2, pos.z, t); v.hurt = shake * .4;
    v.render(c, W, H); hud(c, sp);
  }
  function hud(c, sp) {
    const u = Math.min(W, H) / 300; c.save(); c.textBaseline = 'middle';
    const glass = (x, y, w, h) => { c.fillStyle = '#07060fb8'; c.beginPath(); c.roundRect(x, y, w, h, 10 * u); c.fill(); c.strokeStyle = '#ffffff22'; c.lineWidth = 1; c.stroke(); };
    glass(8 * u, 8 * u, 96 * u, 34 * u);
    c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = `800 ${16 * u}px Rubik, sans-serif`; c.fillText(String(score), 16 * u, 22 * u);
    c.font = `700 ${7 * u}px Rubik, sans-serif`; c.fillStyle = '#ff8ad8'; c.fillText('DRIFT POINTS', 16 * u, 35 * u);
    glass(W - 72 * u, 8 * u, 64 * u, 34 * u); c.textAlign = 'center';
    c.fillStyle = time < 6 && (t * 4 | 0) % 2 ? '#ff5a7a' : '#ffcf3a'; c.font = `800 ${16 * u}px Rubik, sans-serif`; c.fillText(time.toFixed(1), W - 40 * u, 22 * u);
    c.font = `700 ${7 * u}px Rubik, sans-serif`; c.fillStyle = '#9aa'; c.fillText(`${Math.round(sp * 3.6)} KM/H`, W - 40 * u, 35 * u);
    if (pending > 0) {
      c.fillStyle = '#18e4ff'; c.font = `800 ${22 * u}px Rubik, sans-serif`; c.fillText(String(Math.round(pending)), W / 2, H * .2);
      c.font = `800 ${11 * u}px Rubik, sans-serif`; c.fillStyle = '#ff8ad8'; c.fillText(`x${mult.toFixed(1)}`, W / 2, H * .2 + 18 * u);
    }
    if (msg) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.col || '#fff'; c.font = `800 ${20 * u}px Rubik, sans-serif`; c.fillText(msg.txt, W / 2, H * .34); if (msg.sub) { c.font = `700 ${9 * u}px Rubik, sans-serif`; c.fillStyle = '#fff'; c.fillText(msg.sub, W / 2, H * .34 + 16 * u); } c.globalAlpha = 1; }
    if (fingers.steer) { const f = fingers.steer; c.strokeStyle = '#ffffff40'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(f.ax - 40 * u, f.ay); c.lineTo(f.ax + 40 * u, f.ay); c.stroke(); c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(f.ax + clamp(f.x - f.ax, -40 * u, 40 * u), f.ay, 9 * u, 0, 7); c.fill(); }
    if (fingers.right) { const f = fingers.right; c.strokeStyle = '#ff2fa0'; c.lineWidth = 2 * u; c.beginPath(); c.arc(f.x, f.y, 18 * u, 0, 7); c.stroke(); c.fillStyle = '#ff2fa0'; c.font = `700 ${7 * u}px Rubik, sans-serif`; c.fillText('BRAKE', f.x, f.y); }
    if (t < 3) { c.fillStyle = '#ffffffd8'; c.font = `600 ${8.5 * u}px Rubik, sans-serif`; c.fillText('Drag to steer · steer hard to drift · 2nd thumb: handbrake', W / 2, H * .62); if (t < 2) { c.font = `800 ${40 * u}px Rubik, sans-serif`; c.fillText(String(2 - Math.floor(t)), W / 2, H * .45); } }
    c.restore();
  }

  const self = {
    reset() {
      buildWorld();
      ci = 0; lap = 0; pos = PT[0].clone(); const tg = PT[1].clone().sub(PT[0]); hd = Math.atan2(tg.x, tg.z); vel = new Vector3(Math.sin(hd) * 8, 0, Math.cos(hd) * 8);
      steer = 0; brake = false; score = 0; pending = 0; mult = 1; driftT = 0; cleanT = 0; time = 30; t = 0; msg = null; fingers = {}; keys = new Set(); shake = 0; gateNext = 0;
      camPos.set(0, 0, 0); smoke.clear(); spark.clear(); rain.clear();
    },
    resize(w, h) { W = w; H = h; },
    update, draw,
    fx(dt) { if (v) { smoke.update(dt); spark.update(dt); } },
    down(x, y, id = 0) {
      const f = { id, ax: x, ay: y, x, y };
      if (!fingers.steer && (x < W * .55 || fingers.right)) fingers.steer = f; else if (!fingers.right) fingers.right = f; else if (!fingers.steer) fingers.steer = f;
    },
    move(x, y, p, id = 0) { if (!p) return; const f = fingers.steer?.id === id ? fingers.steer : fingers.right?.id === id ? fingers.right : null; if (!f) return; f.x = x; f.y = y; if (f === fingers.steer) steer = clamp((x - f.ax) / (W * .15), -1, 1); },
    up(x, y, id = 0) { if (fingers.steer?.id === id) { fingers.steer = null; steer = 0; } else if (fingers.right?.id === id) fingers.right = null; },
    key(k, d) { if (d) keys.add(k); else keys.delete(k); },
  };
  return self;
}

export default {
  id: 'neon-drift',
  title: 'Neon Drift',
  tag: 'Next Gen · Racing',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 2500, reward: 25,
  hint: 'Drift round a rain-soaked neon city at night. Drag left/right to steer: steer hard at speed to swing the tail out, hold a second thumb for the handbrake. Hold the drift to build points and a multiplier, straighten up to bank them. Hit a wall and the combo is lost. Gates add time.',
  traits: ['theme:city'],
  make,
};
