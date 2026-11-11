// A pretend NativeAR plugin for the test browser (scripts/ar-floor.cjs): it stands in for ARCore / ARKit,
// so the AR kit's world mode (floor finding, hit tests, surfaces) can be played without a phone.
// Injected before the app loads. The "room" is in native space: y = 0 is where the phone was when
// the session began, as on a phone. Change window.__ar from the test to set a scene up.
//
// It also plays the AR phase 2 parts the way the real plugins do: a depth picture of the room (the
// floor, boxes and walls), walls as mapped surfaces, where the room's light comes from and a picture
// of it, anchors that follow the phone's map when it is corrected, and pictures (markers) found in
// the room. Each is sent only when the game asked start() for it, and `can` turns one off to stand
// for an older phone or app.
(() => {
  window.CapacitorCustomPlatform = { name: 'fake-ar' };   // a native platform as far as Capacitor can tell
  const listeners = {};
  const emit = (ev, d) => { for (const cb of listeners[ev] || []) cb(JSON.parse(JSON.stringify(d))); };
  const S = window.__ar = {
    running: false, starts: 0, stops: 0, hitCalls: 0, t: 0, pointsOn: false,
    phone: { x: 0, y: 0, z: 0, yaw: 0, pitch: -.55 },   // radians; pitch below 0 looks down
    sway: .2,                 // the player moves the phone this far from side to side, metres
    tracking: 'TRACKING', why: 'NONE',
    planes: [],               // mapped surfaces: { id, x, y, z, w, d, kind }
    pointHit: null,           // rays that pass near a feature point: { y, chance, noise }
    cloud: [],                // feature points in the room: { x, y, z }
    cloudNoise: .012,
    picture: false,           // draw the pretend camera picture (for screenshots)
    firstHitOnly: false,      // the older plugin answered with the nearest hit only
    sendPoints: true,         // the older plugin sent no feature points
    light: { intensity: .5, color: [1, 1, 1] },
    room: { floor: -1.3, boxes: [], walls: [] },   // what the pretend camera shows: the real floor, boxes { x, z, w, d, top } (tables, sofas), and walls { x, z, nx, nz, w } (upright, 2.5 m high, facing (nx, nz))
    // AR phase 2
    can: { depth: true, walls: true, light: true, anchors: true, images: true },   // false: this phone or app can't
    asked: {},                // what the game asked start() for
    depthAcross: 24,          // the depth picture's width in samples (its height follows the screen's shape)
    depthNoise: 0,            // metres of noise on it
    depthSent: 0, envSent: 0,
    sun: null,                // the room's main light: { x, y, z } towards it, or null for an evenly lit room
    sunKnown: true,           // the phone says where it is itself (ARCore); false: only the room's picture shows it (ARKit)
    envUp: .5, envDown: .22,  // how bright the room's picture is above and below the horizon
    anchors: {},              // id -> { p, q } as the game gave them
    shift: { x: 0, y: 0, z: 0 },   // the phone corrects its map: every anchor moves by this
    images: [], badImages: [],     // the pictures the game registered ({ name, width, size }); names this phone turns down
    markers: {},              // pictures in the room: name -> { x, y, z, yaw, tracked } (lying flat, facing up)
    rng: (s => () => ((s = Math.imul(s ^ s >>> 15, 2246822507) ^ Math.imul(s ^ s >>> 13, 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296))(12345),
  };
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += S.rng(); return (u - 3) / .7071; };
  const FOV = 60 * Math.PI / 180;
  const where = () => ({ x: S.phone.x + Math.sin(S.t * 1.7) * S.sway, y: S.phone.y, z: S.phone.z });
  const turn = () => {
    const a = S.phone.yaw + Math.sin(S.t * 1.1) * .12, p = S.phone.pitch, c = Math.cos(a), s = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
    return [[c, 0, -s], [s * sp, cp, c * sp], [s * cp, -sp, c * cp]];   // the camera's x, y and z axes in the room
  };
  const pose = () => { const R = turn(), o = where(); return [...R[0], 0, ...R[1], 0, ...R[2], 0, o.x, o.y, o.z, 1]; };
  const proj = () => { const f = 1 / Math.tan(FOV / 2), a = innerWidth / innerHeight, n = .05, fa = 100; return [f / a, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; };
  const flat = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  function rayAt(px, py) {
    const f = 1 / Math.tan(FOV / 2), a = innerWidth / innerHeight, R = turn();
    const cx = (px / innerWidth * 2 - 1) * a / f, cy = (1 - py / innerHeight * 2) / f, cz = -1;
    const d = [0, 1, 2].map(i => R[0][i] * cx + R[1][i] * cy + R[2][i] * cz), l = Math.hypot(...d);
    return { o: where(), d: d.map(v => v / l) };
  }
  // a wall's pose: its y axis stands out of it, x runs along it and z down it
  const wallPose = (x, y, z, nx, nz) => [nz, 0, -nx, 0, nx, 0, nz, 0, 0, -1, 0, 0, x, y, z, 1];
  const wallsOn = () => !!(S.asked.walls && S.can.walls);
  function hits(px, py) {
    const { o, d } = rayAt(px, py), out = [];
    if (wallsOn()) for (const p of S.planes) {
      if (p.kind !== 'wall') continue;
      const den = d[0] * p.nx + d[2] * p.nz; if (den > -1e-3) continue;   // (only from its front)
      const t = ((p.x - o.x) * p.nx + (p.z - o.z) * p.nz) / den; if (t <= 0) continue;
      const x = o.x + d[0] * t, y = o.y + d[1] * t, z = o.z + d[2] * t;
      if (Math.abs((x - p.x) * p.nz - (z - p.z) * p.nx) <= p.w / 2 && Math.abs(y - p.y) <= p.d / 2) out.push({ t, kind: 'plane', surface: 'wall', pose: wallPose(x, y, z, p.nx, p.nz) });
    }
    if (d[1] < -.02) {
      for (const p of S.planes) {
        if (p.kind === 'wall') continue;
        const t = (p.y - o.y) / d[1]; if (t <= 0) continue;
        const x = o.x + d[0] * t, z = o.z + d[2] * t;
        if (Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2) out.push({ t, kind: 'plane', pose: flat(x, p.y, z), ...(p.kind ? { surface: p.kind } : {}) });
      }
      const ph = S.pointHit;
      if (ph && S.rng() < ph.chance) {
        const y = ph.y + gauss() * (ph.noise || 0), t = (y - o.y) / d[1];
        if (t > 0) out.push({ t, kind: 'point', pose: flat(o.x + d[0] * t, y, o.z + d[2] * t) });
      }
    }
    out.sort((a, b) => a.t - b.t);
    return (S.firstHitOnly ? out.slice(0, 1) : out).map(({ t, ...h }) => h);
  }
  function seen() {   // the feature points in view now, a little noisy, as x, y, z triples in millimetres
    const R = turn(), o = where(), out = [];
    for (const p of S.cloud) {
      const x = p.x - o.x, y = p.y - o.y, z = p.z - o.z, l = Math.hypot(x, y, z) || 1;
      if (-(R[2][0] * x + R[2][1] * y + R[2][2] * z) / l < .78 || l > 6) continue;   // outside the picture
      const k = S.cloudNoise * (1 + l * .5);
      out.push(Math.round((p.x + gauss() * k) * 1000), Math.round((p.y + gauss() * k) * 1000), Math.round((p.z + gauss() * k) * 1000));
    }
    return out;
  }
  // How far along a ray the pretend room is: the floor, the boxes standing on it and the walls (Infinity: nothing).
  function cast(o, d) {
    const fy = S.room.floor; let best = Infinity;
    if (d[1] < -1e-4) { const t = (fy - o.y) / d[1]; if (t > 0) best = t; }
    for (const b of S.room.boxes) {
      const lo = [b.x - b.w / 2, fy, b.z - b.d / 2], hi = [b.x + b.w / 2, b.top, b.z + b.d / 2], at = [o.x, o.y, o.z];
      let t0 = 0, t1 = best;
      for (let i = 0; i < 3 && t0 <= t1; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (at[i] < lo[i] || at[i] > hi[i]) t0 = Infinity; continue; }
        const a = (lo[i] - at[i]) / d[i], c = (hi[i] - at[i]) / d[i]; t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
      }
      if (t0 <= t1 && t0 > 0) best = t0;
    }
    for (const w of S.room.walls || []) {
      const den = d[0] * w.nx + d[2] * w.nz; if (Math.abs(den) < 1e-6) continue;
      const t = ((w.x - o.x) * w.nx + (w.z - o.z) * w.nz) / den; if (t <= 0 || t >= best) continue;
      const x = o.x + d[0] * t, y = o.y + d[1] * t, z = o.z + d[2] * t;
      if (Math.abs((x - w.x) * w.nz - (z - w.z) * w.nx) <= w.w / 2 && y >= fy && y <= fy + 2.5) best = t;
    }
    return best;
  }
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };
  // The depth picture: how far the room is from the camera's plane at a grid of spots over the whole
  // view, in millimetres, 16 bits each (0: not known), as the real plugins send it.
  function depth() {
    const w = S.depthAcross, h = Math.max(2, Math.round(w * innerHeight / innerWidth)), out = new Uint8Array(w * h * 2), R = turn();
    for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k += 2) {
      const { o, d } = rayAt(i / (w - 1) * innerWidth, j / (h - 1) * innerHeight), t = cast(o, d);
      let mm = 0;
      if (t < 60) { const z = -t * (d[0] * R[2][0] + d[1] * R[2][1] + d[2] * R[2][2]) + gauss() * S.depthNoise; mm = Math.max(0, Math.min(65535, Math.round(z * 1000))); }
      out[k] = mm & 255; out[k + 1] = mm >> 8;
    }
    S.depthSent++;
    emit('depth', { w, h, d: b64(out), pose: pose(), proj: proj() });
  }
  // The picture of the room's light: six 16 x 16 faces (+x -x +y -y +z -z, laid out as graphics chips
  // keep cube maps), brighter above than below, with a glaring patch where the main light is.
  function env() {
    const N = 16, rgb = new Float32Array(6 * N * N * 3), sun = S.sun, sl = sun ? Math.hypot(sun.x, sun.y, sun.z) : 1;
    let at = 0, sum = 0, top = 0;
    for (let f = 0; f < 6; f++) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const a = (c + .5) / N * 2 - 1, b = (r + .5) / N * 2 - 1;
      const v = f === 0 ? [1, -b, -a] : f === 1 ? [-1, -b, a] : f === 2 ? [a, 1, b] : f === 3 ? [a, -1, -b] : f === 4 ? [a, -b, 1] : [-a, -b, -1], l = Math.hypot(...v);
      let e = v[1] / l > 0 ? S.envUp : S.envDown;
      if (sun && (v[0] * sun.x + v[1] * sun.y + v[2] * sun.z) / l / sl > .93) e = 14;
      const tint = S.light.color || [1, 1, 1];
      for (let k = 0; k < 3; k++) { const x = e * tint[k]; rgb[at++] = x; sum += x; if (x > top) top = x; }
    }
    const max = Math.max(1e-6, Math.min(top, 32 * sum / rgb.length)), px = new Uint8Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) px[i] = Math.round(255 * Math.sqrt(Math.min(1, rgb[i] / max)));
    S.envSent++;
    emit('env', { size: N, max, px: b64(px) });
  }
  const lightNow = () => {
    if (!(S.asked.light === 'real' && S.can.light) || !S.sun || !S.sunKnown) return S.light;
    const l = Math.hypot(S.sun.x, S.sun.y, S.sun.z) || 1;
    return { ...S.light, dir: [S.sun.x / l, S.sun.y / l, S.sun.z / l] };
  };
  // a pose from a place and a turn (quaternion x, y, z, w)
  const poseOf = (p, q) => {
    const [x, y, z, w] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, p[0], p[1], p[2], 1];
  };
  // The registered pictures the camera can see now: lying flat, x to the picture's right, z down it.
  function seenImages() {
    const R = turn(), o = where(), out = [];
    for (const im of S.images) {
      const m = S.markers[im.name]; if (!m || im.bad) continue;
      const x = m.x - o.x, y = m.y - o.y, z = m.z - o.z, l = Math.hypot(x, y, z) || 1;
      if (-(R[2][0] * x + R[2][1] * y + R[2][2] * z) / l < .8 || l > 4) continue;   // out of the picture, or too far to make out
      const c = Math.cos(m.yaw || 0), s = Math.sin(m.yaw || 0);
      out.push({ name: im.name, pose: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, m.x, m.y, m.z, 1], w: im.width || m.w || .1, tracked: m.tracked !== false });
    }
    return out;
  }
  // The pretend camera picture, behind the see-through page: a plank floor at the room's real floor
  // height and any boxes, drawn with the same pose and lens the plugin reports. Screenshots then show
  // whether the kit's 3D really sits on the "real" floor.
  let cam = null;
  function picture() {
    if (!cam) { cam = document.createElement('canvas'); cam.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1'; document.body?.prepend(cam); }
    if (!cam.isConnected) { document.body?.prepend(cam); if (!cam.isConnected) return; }
    const W = cam.width = innerWidth, H = cam.height = innerHeight, g = cam.getContext('2d'), R = turn(), o = where(), f = 1 / Math.tan(FOV / 2), a = W / H;
    const to = (x, y, z) => { x -= o.x; y -= o.y; z -= o.z; const cx = R[0][0] * x + R[0][1] * y + R[0][2] * z, cy = R[1][0] * x + R[1][1] * y + R[1][2] * z, cz = R[2][0] * x + R[2][1] * y + R[2][2] * z; return cz > -.08 ? null : [(cx * f / a / -cz + 1) / 2 * W, (1 - cy * f / -cz) / 2 * H]; };
    const hz = (1 - Math.tan(-S.phone.pitch) * f) / 2 * H;   // the horizon line
    const wall = g.createLinearGradient(0, 0, 0, H); wall.addColorStop(0, '#cfc8bb'); wall.addColorStop(1, '#a89f90'); g.fillStyle = wall; g.fillRect(0, 0, W, H);
    g.fillStyle = '#8a6a48'; g.fillRect(0, Math.max(0, hz), W, H);
    const line = (x0, y0, z0, x1, y1, z1, n = 24) => { let last = null; g.beginPath(); for (let i = 0; i <= n; i++) { const p = to(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, z0 + (z1 - z0) * i / n); if (p && last) { g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); } last = p; } g.stroke(); };
    const fy = S.room.floor; g.strokeStyle = '#5b4126'; g.lineWidth = 1.5;
    for (let x = -6; x <= 6; x += .25) line(x, fy, -10, x, fy, 3);
    g.strokeStyle = '#6b4c2c'; g.lineWidth = 1; for (let z = -10; z <= 3; z += 1.5) line(-6, fy, z, 6, fy, z);
    for (const b of S.room.boxes) {
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, t = b.top;
      const quad = (pts, col) => { const q = pts.map(p => to(...p)); if (q.some(p => !p)) return; g.fillStyle = col; g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); };
      quad([[x0, fy, z1], [x1, fy, z1], [x1, t, z1], [x0, t, z1]], '#3d4d66'); quad([[x0, fy, z0], [x0, fy, z1], [x0, t, z1], [x0, t, z0]], '#34425a'); quad([[x1, fy, z0], [x1, fy, z1], [x1, t, z1], [x1, t, z0]], '#34425a');
      quad([[x0, t, z0], [x1, t, z0], [x1, t, z1], [x0, t, z1]], '#51668a');
    }
    const quad4 = (pts, col) => { const q = pts.map(p => to(...p)); if (q.some(p => !p)) return; g.fillStyle = col; g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); };
    for (const w of S.room.walls || []) {   // a wall: a painted panel from the floor up
      const tx = w.nz * w.w / 2, tz = -w.nx * w.w / 2;
      quad4([[w.x - tx, fy, w.z - tz], [w.x + tx, fy, w.z + tz], [w.x + tx, fy + 2.5, w.z + tz], [w.x - tx, fy + 2.5, w.z - tz]], '#7d8fa6');
    }
    for (const im of S.images) {             // a marker: a card lying where the scene put it
      const m = S.markers[im.name]; if (!m) continue;
      const c = Math.cos(m.yaw || 0), s = Math.sin(m.yaw || 0), h = (im.width || m.w || .1) / 2, k = (a, b) => [m.x + c * a + s * b, m.y, m.z - s * a + c * b];
      quad4([k(-h, -h), k(h, -h), k(h, h), k(-h, h)], '#f4f1e8'); quad4([k(-h * .6, -h * .6), k(h * .2, -h * .6), k(h * .2, h * .1), k(-h * .6, h * .1)], '#1b2430');
    }
  }
  let frameTimer = 0, planeTimer = 0, depthTimer = 0, envTimer = 0;
  const frame = () => {
    S.t += 1 / 30; if (S.picture) picture();
    const d = { t: S.t * 1000, tracking: S.tracking, why: S.why, pose: pose(), proj: proj(), light: lightNow() };
    if (S.images.length && S.can.images && S.tracking === 'TRACKING') { const im = seenImages(); if (im.length) d.images = im; }
    emit('frame', d);
  };
  const planes = () => {
    const walls = wallsOn();
    const d = { planes: S.tracking === 'TRACKING' ? S.planes.filter(p => p.kind !== 'wall' || walls).map(p => ({ id: p.id, pose: p.kind === 'wall' ? wallPose(p.x, p.y, p.z, p.nx, p.nz) : flat(p.x, p.y, p.z), w: p.w, d: p.d, ...(p.kind ? { kind: p.kind } : {}) })) : [] };
    if (S.sendPoints && S.pointsOn && S.tracking === 'TRACKING') d.points = seen();
    const ids = Object.keys(S.anchors);
    if (ids.length) d.anchors = ids.map(id => { const a = S.anchors[id]; return { id, pose: poseOf([a.p[0] + S.shift.x, a.p[1] + S.shift.y, a.p[2] + S.shift.z], a.q), tracked: S.tracking === 'TRACKING' }; });
    emit('planes', d);
  };
  const methods = {
    available: () => ({ supported: true, installed: true, status: 'SUPPORTED_INSTALLED' }),
    start(o) {
      S.running = true; S.starts++; S.asked = o || {};
      for (const t of [frameTimer, planeTimer, depthTimer, envTimer]) clearInterval(t);
      frameTimer = setInterval(frame, 33); planeTimer = setInterval(planes, 250);
      const depthOn = !!(S.asked.depth && S.can.depth), real = S.asked.light === 'real' && S.can.light;
      if (depthOn) depthTimer = setInterval(() => { if (S.tracking === 'TRACKING') depth(); }, 100);
      if (real) envTimer = setInterval(env, 500);
      return { started: true, depth: depthOn, walls: wallsOn(), light: real ? 'real' : 'ambient' };
    },
    stop() { S.running = false; S.stops++; S.pointsOn = false; S.anchors = {}; for (const t of [frameTimer, planeTimer, depthTimer, envTimer]) clearInterval(t); cam?.remove(); return {}; },
    hitTest({ x, y }) { S.hitCalls++; return { hits: S.running ? hits(x, y) : [] }; },
    points({ on }) { if (!S.sendPoints) throw new Error('not implemented'); S.pointsOn = !!on; return {}; },
    anchor({ id, p, q }) { if (!S.can.anchors) throw new Error('not implemented'); if (!S.running || S.tracking !== 'TRACKING' || Object.keys(S.anchors).length >= 16) return { ok: false }; S.anchors[id] = { p, q }; return { ok: true }; },
    removeAnchor({ id }) { if (!S.can.anchors) throw new Error('not implemented'); delete S.anchors[id]; return { ok: true }; },
    images({ images }) {
      if (!S.can.images) throw new Error('not implemented');
      S.images = (images || []).map(i => ({ name: i.name, width: i.width, size: (i.png || '').length, bad: S.badImages.includes(i.name) }));
      return { added: S.images.filter(i => !i.bad).map(i => i.name), rejected: S.images.filter(i => i.bad).map(i => i.name) };
    },
  };
  window.Capacitor = {
    PluginHeaders: [{ name: 'NativeAR', methods: [...Object.keys(methods).map(name => ({ name, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener' }] }],
    nativePromise: (plugin, method, opts) => new Promise((ok, no) => setTimeout(() => { try { ok(methods[method](opts || {})); } catch (e) { no(e); } }, 4)),
    nativeCallback(plugin, method, opts, cb) { if (method === 'addListener') (listeners[opts.eventName] ||= []).push(cb); return Promise.resolve('fake'); },
  };
})();
