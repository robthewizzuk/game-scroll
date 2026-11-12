// Engine test scenes: heavy scenes made in code, each flown through with one of the Next Gen engine's
// detail systems off and then on, so a phone can say what the system is worth on its own graphics chip.
// src/detail-tour.js runs them (QA panel › Phone test tour › Engine test scenes). The automatic checks
// (scripts/detail-test.cjs) draw scenes like these on a build machine's software renderer, which can
// count triangles and compare pictures but can't time a phone.
//   valley   cluster detail (src/kit/detail.js): a hillside, rocks and brick houses of dense triangles
//   forest   detail for copies (hd3d.js autoCopies): thousands of firs and rocks placed with gs.props
//   village  real surface detail (gs.models.relief): a street of houses whose bricks and tiles are real triangles
//   town     hiding what is behind other things (src/kit/occlude.js): an old town's lanes, with statues, urns, rocks and crates round every house
//            and shadows in tiles (src/kit/shadow-tiles.js): the same walk once more with the sun's shadow map drawn whole, as it used to be
// A scene: { v (its view), holds (what is in it, in words), modes: [{ key, name, enter(draw) }], path(t, cam),
// tell() (a few words about the run just flown), dispose() }, and where it has more than one pair of runs to set
// side by side, pairs: [[off key, on key, the comparison's own words (or the two names)]]. enter() sets the mode up and, where something has to be built
// first, draws frames with draw() until it is: it gives { build (ms), note } or nothing. uncounted() says
// the engine can't count the last run's triangles (the chip picked what to draw).
// size: 1 is the full scene; the app's own check (scripts/app-test.cjs tour) runs small ones.

const HELD = 1 << 29;   // the layer a twin waits on while its shader builds (hd3d.js HOLD_LAYER)
const LIMIT = 240000;   // the longest a mode waits for its builds
const num = n => Math.round(n).toLocaleString('en-GB');
async function until(draw, test, limit = LIMIT) {
  const t0 = performance.now();
  while (!test() && performance.now() - t0 < limit) await draw();
  return performance.now() - t0;
}
const trisOf = g => (g.index ? g.index.count : g.attributes.position.count) / 3;

// a bumpy hillside, n x n squares
function land(T, n, size) {
  const g = new T.PlaneGeometry(size, size, n, n).rotateX(-Math.PI / 2), p = g.attributes.position;
  const h = (x, z) => 5 * Math.sin(x * .05) * Math.cos(z * .07) + 1.2 * Math.sin(x * .31 + z * .17) + .25 * Math.sin(x * 1.7) * Math.sin(z * 2.3) + .04 * Math.sin(x * 6.1 + 1) * Math.sin(z * 5.7);
  for (let i = 0; i < p.count; i++) p.setY(i, h(p.getX(i), p.getZ(i)));
  g.computeVertexNormals(); return g;
}
// a knobbly rock: a ball pushed in and out
function boulder(T, n, r, seed) {
  const g = new T.SphereGeometry(r, n * 2, n), p = g.attributes.position, v = new T.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + .18 * Math.sin(v.x * 3 / r + seed) * Math.sin(v.y * 4 / r + seed * 2) + .06 * Math.sin(v.z * 11 / r + seed) * Math.sin(v.x * 13 / r) + .015 * Math.sin(v.y * 37 / r + seed) * Math.sin(v.z * 41 / r); p.setXYZ(i, v.x * k, v.y * k, v.z * k); }
  g.computeVertexNormals(); return g;
}
// a box with brick courses pressed into its walls (all hard edges: cluster detail leaves it alone, as it should)
function block(T, w, h, d, q, seed) {
  const g = new T.BoxGeometry(w, h, d, Math.max(2, Math.round(60 * q)), Math.max(2, Math.round(48 * q)), Math.max(2, Math.round(60 * q))), p = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), b = .035 * Math.sign(Math.sin(y * 9 + seed)) * (Math.sin((x + z) * 5 + Math.floor(y * 9 / Math.PI) * 1.3) > -.9 ? 1 : -1.5); p.setXYZ(i, x + nrm.getX(i) * b, y + nrm.getY(i) * b, z + nrm.getZ(i) * b); }
  g.computeVertexNormals(); return g;
}
function view(gs, far, fog = .0015) {
  const v = new gs.hd.HDView({ bg: '#9ab4d0', fog, amb: .4 });
  v.cam.far = far; v.cam.updateProjectionMatrix();
  const sun = gs.hd.sun('#fff2d8', 3, 80, [-.45, 1, .35]); v.scene.add(sun, sun.target); v.sun = sun; sun.follow(0, 0, 0);
  return { v, sun };
}
function clear(v, extra = []) {
  const seen = new Set();
  v.scene.traverse(o => { if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } });
  for (const g of extra) g.dispose();
  v.release(); v.scene.clear();
}

/* ---------- valley: cluster detail ---------- */
function valley({ gs, HD, size }) {
  const T = gs.THREE, q = .75 * Math.sqrt(size), { v, sun } = view(gs, 320), was = { detail: HD.detail, lod: HD.autoLod };
  const parts = [], add = (g, m, at) => { const mesh = new T.Mesh(g, m); mesh.position.set(...at); mesh.castShadow = mesh.receiveShadow = true; v.scene.add(mesh); parts.push(mesh); };
  add(land(T, Math.round(700 * q), 420), gs.hd.pbr('#6f8a52', { rough: .9 }), [0, 0, 0]);
  const stone = gs.hd.pbr('#9a948a', { rough: .7 }), wall = gs.hd.pbr('#b9a78c', { rough: .8 });
  const rocks = [0, 1, 2, 3, 4, 5].map(i => boulder(T, Math.max(4, Math.round(110 * q)), 2 + (i % 3), i * 1.7));   // six kinds, placed 36 times
  for (let i = 0; i < 36; i++) add(rocks[i % 6], stone, [Math.sin(i * 2.4) * (30 + i * 4.5), 2 + (i % 3), Math.cos(i * 2.4) * (30 + i * 4.5)]);
  const houses = [0, 1, 2].map(i => block(T, 8 + i * 2, 6 + i, 7 + i, q, i));
  for (let i = 0; i < 18; i++) add(houses[i % 3], wall, [Math.cos(i * 1.9) * (45 + i * 7), 4, Math.sin(i * 1.9) * (45 + i * 7)]);
  let full = 0; for (const m of parts) full += trisOf(m.geometry);
  const taken = () => [...(v.details?.map.values() || [])].filter(e => e.twin && !(e.twin.layers.mask & HELD)).length;
  return {
    v, holds: `${num(full)} triangles in ${parts.length} meshes`,
    modes: [
      { key: 'off', name: 'every triangle', enter() { HD.detail = false; HD.autoLod = false; } },   // (nor the older whole-mesh levels: they arrive part-way through a run)
      { key: 'on', name: 'cluster detail', async enter(draw) {
        const t0 = performance.now(); HD.detail = true; HD.autoLod = was.lod; await draw(); await draw();
        await until(draw, () => !v.detailPending()); const build = performance.now() - t0;
        return { build, note: `${taken()} mesh${taken() === 1 ? '' : 'es'} drawn in clusters` + (v.detailPending() ? ', the rest still being built' : '') };
      } },
    ],
    // a walk down the valley, turning as it goes (24 s from end to end, then again)
    path(t, cam) { const a = (t / 24) % 1; cam.position.set(Math.sin(a * 3) * 40, 7 + 3 * Math.sin(a * 9), 150 - a * 260); cam.lookAt(Math.sin(a * 3 + .6) * 30, 4, 100 - a * 260); sun.follow(cam.position.x, 0, cam.position.z); },
    tell() {
      const d = HD.info.detail; if (!HD.detail || !d) return null;
      let bytes = 0; const seen = new Set(); for (const e of v.details?.map.values() || []) if (e.cl && !seen.has(e.cl)) { seen.add(e.cl); bytes += e.cl.bytes || 0; }
      return `cluster tables ${(bytes / 1048576).toFixed(1)} MB`;
    },
    dispose() { HD.detail = was.detail; HD.autoLod = was.lod; clear(v); },
  };
}

/* ---------- forest: detail for copies ---------- */
function forest({ gs, HD, size, gpu }) {
  const T = gs.THREE, { Props } = gs.props, N = Math.max(200, Math.round(20000 * size)), span = 900 * Math.sqrt(N / 20000), { v, sun } = view(gs, span * 1.5);
  const was = { copies: HD.copies, cull: HD.gpuCull };
  const merge = list => { const P = [], Nn = [], U = [], I = []; for (const g of list) { const b = P.length / 3; P.push(...g.attributes.position.array); Nn.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); for (const i of g.index.array) I.push(b + i); g.dispose(); } const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); g.setIndex(I); return g; };
  const fir = merge([new T.ConeGeometry(1.7, 3, 16, 4).translate(0, 2.6, 0), new T.ConeGeometry(1.3, 2.6, 16, 4).translate(0, 4.4, 0), new T.ConeGeometry(.9, 2.2, 16, 4).translate(0, 6, 0), new T.CylinderGeometry(.18, .24, 1.4, 8, 1).translate(0, .7, 0)]);
  const rock = (() => { const g = gs.props.simplify(new T.IcosahedronGeometry(1.4, 12), 1), p = g.attributes.position, w = new T.Vector3(); for (let i = 0; i < p.count; i++) { w.fromBufferAttribute(p, i); const k = 1 + .16 * Math.sin(w.x * 2.6) * Math.sin(w.y * 3.1 + 1) + .05 * Math.sin(w.z * 7 + 2) * Math.sin(w.x * 8); p.setXYZ(i, w.x * k, w.y * k * .8, w.z * k); } g.computeVertexNormals(); return g; })();
  const ground = new T.Mesh(new T.PlaneGeometry(span * 1.4, span * 1.4).rotateX(-Math.PI / 2), gs.hd.pbr('#6f8a52', { rough: .9 })); ground.receiveShadow = true; v.scene.add(ground);
  const props = new Props(v.scene), area = { x0: -span / 2, z0: -span / 2, x1: span / 2, z1: span / 2 };
  const kf = props.kind('fir', fir, gs.hd.pbr('#3f6b3a', { rough: .9 }), { capacity: N }), kr = props.kind('rock', rock, gs.hd.pbr('#9a948a', { rough: .7 }), { capacity: Math.max(20, N / 10 | 0) });
  props.scatter('fir', N, area, { seed: 7, gap: 2.5, scale: [.8, 1.4] }); props.scatter('rock', Math.max(20, N / 10 | 0), area, { seed: 3, gap: 6, scale: [.5, 1.3] }); props.done();
  const levels = m => m.userData.gsLevels?.levels || 0, firs = props.count('fir'), rocks = props.count('rock');
  const withLevels = async draw => {
    const t0 = performance.now(); HD.copies = true; await draw(); await draw();
    await until(draw, () => levels(kf) && levels(kr));
    return { build: performance.now() - t0, note: levels(kf) && levels(kr) ? `${levels(kf)} simpler levels of a fir, ${levels(kr)} of a rock` : 'the levels did not arrive in time' };
  };
  // WebGPU picks big sets of copies on the chip, except while frame generation runs: then the CPU picks them.
  // Both ways are flown there (the second is what a 120 Hz phone does most of the time)
  const modes = gpu ? [
    { key: 'off', name: 'every copy whole', enter() { HD.copies = false; HD.gpuCull = was.cull; } },
    { key: 'on', name: 'detail levels', enter(draw) { HD.gpuCull = was.cull; return withLevels(draw); } },
    { key: 'cpu-off', name: 'whole, picked on the CPU', enter() { HD.copies = false; HD.gpuCull = false; } },
    { key: 'cpu-on', name: 'levels, picked on the CPU', enter(draw) { HD.gpuCull = false; return withLevels(draw); } },
  ] : [
    { key: 'off', name: 'every copy whole', enter() { HD.copies = false; } },
    { key: 'on', name: 'detail levels', enter: withLevels },
  ];
  return {
    v, holds: `${num(firs)} firs of ${num(trisOf(fir))} triangles and ${num(rocks)} rocks of ${num(trisOf(rock))}`,
    modes,
    // a walk round a circle through the trees, 6 metres a second
    path(t, cam) { const R = span * .28, a = t * 6 / R; cam.position.set(Math.cos(a) * R, 6, Math.sin(a) * R); cam.lookAt(Math.cos(a + .5) * R * 1.4, 4, Math.sin(a + .5) * R * 1.4); sun.follow(cam.position.x, 0, cam.position.z); },
    pairs: gpu ? [['off', 'on'], ['cpu-off', 'cpu-on']] : null,
    tell() { return null; },
    uncounted() { return [kf, kr].some(m => !!m.userData.gpuTwin?.isGpu?.()); },
    dispose() { HD.copies = was.copies; HD.gpuCull = was.cull; props.clear(); clear(v, [fir, rock]); },
  };
}

/* ---------- village: real surface detail ---------- */
function village({ gs, size }) {
  const T = gs.THREE, n = Math.max(3, Math.round(12 * size)), { v, sun } = view(gs, 200, .003), step = 13, len = Math.ceil(n / 2) * step;
  const ground = new T.Mesh(new T.PlaneGeometry(len + 120, 160).rotateX(-Math.PI / 2), gs.hd.pbr('#7b7468', { rough: .95 })); ground.receiveShadow = true; v.scene.add(ground);
  const STYLES = ['brick', 'stone', 'timber'], houses = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, h = gs.models.building({ style: STYLES[i % 3], w: 9, d: 7, floors: 1 + (i % 3 === 1), roof: 'gable', seed: i % 3 });
    h.position.set(-len / 2 + step / 2 + Math.floor(i / 2) * step, 0, side * 10); h.rotation.y = side > 0 ? Math.PI : 0; v.scene.add(h); houses.push(h);
  }
  const meshes = []; for (const h of houses) h.traverse(o => { if (o.isMesh) meshes.push(o); });
  let flat = 0; for (const m of meshes) flat += trisOf(m.geometry);
  const got = () => meshes.filter(m => m.userData.relief === 'ready'), shown = () => [...(v.details?.map.values() || [])].filter(e => e.relief && e.twin && !(e.twin.layers.mask & HELD));
  let on = false;
  return {
    v, holds: `${n} houses, ${num(flat)} triangles before their surfaces are built`,
    modes: [
      { key: 'off', name: 'flat walls and roofs', enter() { if (on) { for (const h of houses) gs.models.relief(h, false); on = false; } } },
      { key: 'on', name: 'real surface detail', async enter(draw) {
        on = true; for (const h of houses) gs.models.relief(h);
        let done = false; Promise.all(houses.map(h => gs.models.relief.ready(h))).then(() => { done = true; }, () => { done = true; });
        const build = await until(draw, () => done) + await until(draw, () => shown().length >= got().length, 20000);
        let tris = 0; for (const e of shown()) tris += e.relief.info?.tris || 0;
        return { build, note: done ? `${got().length} surfaces made of ${num(tris)} triangles` : 'the surfaces did not arrive in time' };
      } },
    ],
    // a walk along the pavement and back, 2.5 metres a second and two from the house fronts (where a wall's
    // bricks are big enough in the picture to be worth their triangles), looking along the street and up at the roofs
    path(t, cam) { const L = len + 20, u = (t * 2.5) % (2 * L), x = (u < L ? u : 2 * L - u) - L / 2, dir = u < L ? 1 : -1; cam.position.set(x, 1.7, -4.4); cam.lookAt(x + dir * 9, 2.4 + .8 * Math.sin(t * .7), -5.6 + 3 * Math.sin(t * .5)); sun.follow(x, 0, 0); },
    tell() { return null; },
    dispose() { if (on) for (const h of houses) gs.models.relief(h, false); clear(v); },
  };
}

/* ---------- town: hiding what is behind other things, and shadows in tiles ---------- */
function town({ gs, HD, size }) {
  const T = gs.THREE, G = Math.max(3, Math.round(5 * Math.sqrt(size))), P = 26, B = 18, span = G * P, { v, sun } = view(gs, 260, .002), was = { on: HD.occlude, sleep: HD.occludeSleep, tiles: HD.shadowTiles };
  const add = (g, m, x, y, z, cast = true) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; v.scene.add(o); return o; };
  add(new T.PlaneGeometry(span + 120, span + 120).rotateX(-Math.PI / 2), gs.hd.pbr('#77726a', { rough: .95 }), 0, 0, 0, false);
  // An old town: rows of houses with a street between the rows, and every other row half a house along, so
  // that the lanes between the houses of a row end at a house of the next. sz(j): where street j runs between
  // the rows (0..G); X(i, j): where lane i of row j runs (0..G).
  const sz = j => (j - G / 2) * P, X = (i, j) => (i - G / 2) * P + (j % 2) * P / 2;
  const box = new T.BoxGeometry(1, 1, 1), walls = ['#b9a78c', '#a8846c', '#c9c2b4'].map(c => gs.hd.pbr(c, { rough: .85 }));
  // round every house, things of a few thousand triangles each: from anywhere, most of the town is behind a house
  const pts = []; for (let k = 0; k <= 40; k++) { const u = k / 40; pts.push(new T.Vector2(.18 + .34 * Math.sin(u * 2.6) ** 2 * (1 - u * .35), u * 1.3)); }
  const kinds = [
    [new T.TorusKnotGeometry(.5, .18, 160, 16), gs.hd.pbr('#8a6a3a', { rough: .4, metal: .8 }), 1.2],
    [new T.LatheGeometry(pts, 48), gs.hd.pbr('#b0623f', { rough: .8 }), 0],
    [boulder(T, 24, .7, 2), gs.hd.pbr('#9a948a', { rough: .7 }), .55],
    [new T.BoxGeometry(1.1, 1.1, 1.1, 12, 12, 12), gs.hd.pbr('#8a7150', { rough: .9 }), .55],
  ];
  let things = 0, tris = 0;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const bx = X(i, j) + P / 2, bz = sz(j) + P / 2, h = 9 + ((i * 7 + j * 3) % 4) * 2.5;
    add(box, walls[(i + j * 2) % 3], bx, h / 2, bz).scale.set(B, h, B);
    for (let side = 0; side < 4; side++) for (let k = 0; k < 4; k++) {
      const [g, m, y] = kinds[(i + j * 3 + k + side) % 4], a = -6.75 + k * 4.5, b = (side & 1 ? 1 : -1) * (B / 2 + 1.2), o = add(g, m, bx + (side < 2 ? a : b), y, bz + (side < 2 ? b : a));
      o.rotation.y = (i * 5 + j * 3 + k + side) * .7; things++; tris += trisOf(g);
    }
  }
  // a few carts drive up and down the streets, so that things move in front of and behind the houses
  const carts = []; for (let c = 0; c < Math.max(2, G - 1); c++) carts.push(add(new T.BoxGeometry(3.4, 1.6, 2), gs.hd.pbr('#5d6f8a', { rough: .6 }), 0, .9, sz(1 + c % (G - 1)) + 1.6));
  // the walk: up through the town by the lanes (each ends at a house: round it by the street), along the top,
  // back down by the next lanes and along the bottom; 5 metres a second, looking where it is going
  const way = [], c0 = (G >> 1) - 1;
  for (let j = 0; j < G; j++) way.push([X(c0, j), sz(j)], [X(c0, j), sz(j + 1)]);
  for (let j = G - 1; j >= 0; j--) way.push([X(c0 + 1, j), sz(j + 1)], [X(c0 + 1, j), sz(j)]);
  const legs = way.map((p, i) => { const q = way[(i + 1) % way.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }), per = legs.reduce((a, b) => a + b, 0), look = new T.Vector3();
  const at = (u, p) => { u = ((u % per) + per) % per; let i = 0; while (u > legs[i]) u -= legs[i++]; const a = way[i], b = way[(i + 1) % way.length], k = legs[i] ? u / legs[i] : 0; return p.set(a[0] + (b[0] - a[0]) * k, 1.7, a[1] + (b[1] - a[1]) * k); };
  const sum = { n: 0, hid: 0, tris: 0, ms: 0, t: 0, sh: 0, shd: 0, shn: 0, sh0: 0, shd0: 0, first: true };
  return {
    v, holds: `${G * G} houses with ${num(things)} statues, urns, rocks and crates of ${num(tris)} triangles round them`,
    modes: [
      { key: 'off', name: 'all that is in view', enter() { HD.occlude = false; HD.shadowTiles = true; } },
      // (kept at work all through: in a game it rests for a while wherever it saves next to nothing, which would hide what it costs here)
      { key: 'on', name: 'hidden things left out', async enter(draw) { HD.occlude = true; HD.occludeSleep = false; HD.shadowTiles = true; for (let i = 0; i < 12; i++) await draw(); } },
      // the run above once more with the sun's shadow map as it used to be: the sun a texel at a time, and the map drawn whole whenever it or anything under it moves
      { key: 'whole', name: 'shadows drawn whole', async enter(draw) { HD.occlude = true; HD.occludeSleep = false; HD.shadowTiles = false; for (let i = 0; i < 12; i++) await draw(); } },
    ],
    pairs: [['off', 'on'], ['whole', 'on', 'shadows in tiles against shadows drawn whole']],
    path(t, cam) {
      // (what the last frame left out and what its shadow maps took, for tell(): counted from the start of the timed run)
      const I = HD.info, sh = I.shTris || 0, shd = I.shCalls || 0;
      if (t < sum.t) { sum.n = sum.hid = sum.tris = sum.ms = sum.sh = sum.shd = sum.shn = 0; sum.first = true; }
      else {
        sum.n++; if (HD.occlude !== false) { sum.hid += I.occluded || 0; sum.tris += I.occTris || 0; sum.ms += I.occMs || 0; }
        // (the shadow counts run on from frame to frame: a frame's share is what they rose by since the frame before, and the run's first frame has none before it)
        if (!sum.first) { sum.shn++; sum.sh += sh - sum.sh0; sum.shd += shd - sum.shd0; } sum.first = false;
      }
      sum.t = t; sum.sh0 = sh; sum.shd0 = shd;
      at(t * 5, cam.position); at(t * 5 + 7, look); cam.lookAt(look.x, 2.4 + .6 * Math.sin(t * .6), look.z);
      for (let c = 0; c < carts.length; c++) carts[c].position.x = ((t * 3 + c * 17) % span) - span / 2;
      sun.follow(cam.position.x, 0, cam.position.z);
    },
    tell() {
      if (!sum.n) return null;
      const shadows = `shadow maps ${num(sum.sh / Math.max(1, sum.shn))} triangles in ${num(sum.shd / Math.max(1, sum.shn))} draws a frame`;
      return HD.occlude === false ? shadows : `${num(sum.hid / sum.n)} things of ${num(sum.tris / sum.n)} triangles left out a frame, found in ${(sum.ms / sum.n).toFixed(2)} ms · ${shadows}`;
    },
    dispose() { HD.occlude = was.on; HD.occludeSleep = was.sleep; HD.shadowTiles = was.tiles; clear(v); },
  };
}

/** The scenes, in the order they run: [key, name, what it tries, make({ gs, HD, size, gpu })]. */
export const SCENES = [
  ['valley', 'Valley', 'cluster detail', valley],
  ['forest', 'Forest', 'detail for copies', forest],
  ['village', 'Village', 'real surface detail', village],
  ['town', 'Town', 'hiding what is behind other things, and shadows in tiles', town],
];
