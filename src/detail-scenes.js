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
//   square   crowds (src/kit/crowd.js, gs.props.Crowd): a square full of people and dogs, each with a skeleton of its own and then as one crowd
//   field    ground that takes marks (src/kit/marks.js, gs.outdoors.Marks): people, a dog, a jeep and a tank going round a field of sand, grass
//            and bare earth as snow lies, melts to wet earth and dries: once leaving no trace, then with their prints, tracks and parted grass
//   yard     smoke and fire that flow (src/kit/gas.js, gs.gas): a camp fire under a beam, a smoking chimney, a burning drum and an explosion every
//            seven seconds, in a wind that swings round: with no gas, as the smaller version (soft puffs), and on WebGPU as the gas on the graphics chip
//   cliff    land with cliffs, caves and overhangs (src/kit/land-rock.js, gs.outdoors land.rocks()): a walk along the foot of a cliff, through a
//            cave under a spur, out and under an arch: once on the height map alone (over the spur), then with the rock
//   parade   smaller meshes (src/kit/slim.js): people, a dog, a horse and a goods train close up, their points as plain floats and then kept small
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
function village({ gs, HD, size }) {
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
  const sum = { n: 0, tris: 0, px: 0, t: 0 };   // what the surfaces drew a frame and how finely, for tell(): counted from the start of the timed run
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
    path(t, cam) {
      if (t < sum.t) sum.n = sum.tris = sum.px = 0; else if (on) { sum.n++; sum.tris += HD.info.reliefTris || 0; sum.px += HD.info.reliefPx || 0; }
      sum.t = t;
      const L = len + 20, u = (t * 2.5) % (2 * L), x = (u < L ? u : 2 * L - u) - L / 2, dir = u < L ? 1 : -1; cam.position.set(x, 1.7, -4.4); cam.lookAt(x + dir * 9, 2.4 + .8 * Math.sin(t * .7), -5.6 + 3 * Math.sin(t * .5)); sun.follow(x, 0, 0);
    },
    tell() { return on && sum.n ? `the surfaces ${num(sum.tris / sum.n)} triangles a frame, within ${(sum.px / sum.n).toFixed(1)} pixels` : null; },
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
      // (what a game's view would do here by itself: it rests wherever what it leaves out is worth less than finding it costs)
      const pays = HD.info.occPays, verdict = pays == null ? '' : pays ? ' (worth it here: a game keeps it on)' : ' (not worth it here: a game rests it)';
      return HD.occlude === false ? shadows : `${num(sum.hid / sum.n)} things of ${num(sum.tris / sum.n)} triangles left out a frame, found in ${(sum.ms / sum.n).toFixed(2)} ms${verdict} · ${shadows}`;
    },
    dispose() { HD.occlude = was.on; HD.occludeSleep = was.sleep; HD.shadowTiles = was.tiles; clear(v); },
  };
}

/* ---------- square: crowds ---------- */
function square({ gs, size }) {
  const T = gs.THREE, { human, creature } = gs.models, N = Math.max(24, Math.round(300 * size)), span = 26 + 44 * Math.sqrt(N / 300), { v, sun } = view(gs, 220, .002);
  const ground = new T.Mesh(new T.PlaneGeometry(span + 160, span + 160).rotateX(-Math.PI / 2), gs.hd.pbr('#8a8478', { rough: .95 })); ground.receiveShadow = true; v.scene.add(ground);
  // houses round it, so the place has edges and the low sun something to throw across it
  const box = new T.BoxGeometry(1, 1, 1), walls = ['#b9a78c', '#a8846c', '#c9c2b4'].map(c => gs.hd.pbr(c, { rough: .85 })), R0 = span / 2 + 9;
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283, h = 8 + (i * 5 % 4) * 2, o = new T.Mesh(box, walls[i % 3]); o.position.set(Math.sin(a) * R0 * 1.25, h / 2, Math.cos(a) * R0 * 1.25); o.rotation.y = a; o.scale.set(R0 * .42, h, 9); o.castShadow = o.receiveShadow = true; v.scene.add(o); }
  // (no hair in strands and no fur: a crowd has neither, and the two runs should draw the same people)
  const SPECS = [{ seed: 11, strands: false }, { seed: 12, sex: 'f', hairStyle: 'bun', body: '#8a3a3a', legs: '#30364a', strands: false }], DOG = { like: 'dog', fur: false };
  // who is where: each walks, runs or stands on a circle of its own, so that a run by the clock sees the same square whatever its frame rate
  const R = gs.math.rng(5), who = [];
  for (let i = 0; i < N; i++) {
    const kind = i % 6 === 5 ? 2 : i % 2, k = R(), move = k < .14 ? 'idle' : k < .28 ? 'run' : 'walk', sp = move === 'idle' ? 0 : move === 'run' ? 3.2 + R() * .6 : 1.2 + R() * .3;
    who.push({ kind, move, sp, cx: (R() - .5) * span * .8, cz: (R() - .5) * span * .8, r: 3 + R() * 9, a0: R() * 6.283, dir: R() < .5 ? 1 : -1, size: .95 + R() * .1, x: 0, z: 0, turn: 0 });
  }
  const place = (w, t) => { const a = w.a0 + w.dir * w.sp * t / w.r; w.x = w.cx + w.r * Math.sin(a); w.z = w.cz + w.r * Math.cos(a); w.turn = Math.atan2(w.dir * Math.cos(a), -w.dir * Math.sin(a)); };
  const folk = new T.Group(); v.scene.add(folk);
  let crowd = null, made = null, mode = '', twins = [], members = [];
  // the people are sculpted the first time a phone meets them (kept on it afterwards), then stood in the square both ways
  const make = draw => made ||= (async () => {
    const t0 = performance.now(); let done = false, err = null;
    Promise.all([human.ready(SPECS), creature.ready([DOG])]).then(() => { done = true; }, e => { err = e; done = true; });
    await until(draw, () => done); if (err) throw err; if (!done) throw new Error('the people were not sculpted in time');
    const src = [human(SPECS[0]), human(SPECS[1]), creature(DOG)];
    crowd = new gs.props.Crowd(v, { of: src, moves: ['idle', 'walk', 'run'] });
    for (const w of who) {
      place(w, 0);
      const f = src[w.kind].twin(); f.scale.multiplyScalar(w.size); f.rig.play(w.move); folk.add(f); twins.push(f);
      members.push(crowd.add({ x: w.x, z: w.z, turn: w.turn, kind: w.kind, move: w.move, size: w.size }));
    }
    return performance.now() - t0;
  })();
  // (the first run waits for the sculpting and says how long it took)
  // (the crowd's run has the skeleton people out of the scene, not just switched off: a game with a crowd has none, and
  // the view walks everything in its scene each frame, hidden or not. Left in, 19,000 hidden parts cost the crowd's
  // run most of its code time on the first phone to try it)
  const enter = key => async draw => { const first = !made, build = await make(draw); mode = key; folk.visible = key === 'off'; if (key === 'off') { if (!folk.parent) v.scene.add(folk); } else folk.removeFromParent(); crowd.visible = key === 'on'; crowd.update(0); for (let i = 0; i < 4; i++) await draw(); return first ? { build, note: 'two people and a dog sculpted' } : null; };
  const sum = { n: 0, ms: 0, sent: 0, draws: 0, t: 0 }, ahead = new T.Vector3();
  return {
    v, holds: `${num(N)} people and dogs walking, running and standing in a square`,
    modes: [
      { key: 'off', name: 'a skeleton each', enter: enter('off') },
      { key: 'on', name: 'one crowd', enter: enter('on') },
    ],
    // a walk in a figure of eight through the middle of them, 1.5 metres a second, looking where it is going
    path(t, cam) {
      const P = (u, p) => { const a = u * 1.5 / (span * .22); return p.set(Math.sin(a) * span * .3, 1.7, Math.sin(a * 2) * span * .16); };
      P(t, cam.position); P(t + 3, ahead); cam.lookAt(ahead.x, 1.4, ahead.z); sun.follow(cam.position.x, 0, cam.position.z);
      if (!crowd) return;
      const dt = t > sum.t ? Math.min(1, t - sum.t) : 0, t0 = performance.now();
      if (t < sum.t) sum.n = sum.ms = sum.sent = sum.draws = 0;
      sum.t = t; cam.updateMatrixWorld();
      for (let i = 0; i < who.length; i++) {
        const w = who[i]; place(w, t);
        if (mode === 'off') { const f = twins[i]; f.position.set(w.x, 0, w.z); f.rotation.y = w.turn; f.rig.update(dt, { speed: w.sp }); f.see(cam, 800); }
        else { const m = members[i]; m.x = w.x; m.z = w.z; m.turn = w.turn; }
      }
      if (mode === 'on') { crowd.update(dt); sum.sent += crowd.info.drawn; sum.draws += crowd.info.draws; }
      sum.ms += performance.now() - t0; sum.n++;
    },
    tell() {
      if (!sum.n) return null;
      const posed = `posed in ${(sum.ms / sum.n).toFixed(2)} ms a frame`;
      return mode === 'on' ? `${posed} · ${num(sum.sent / sum.n)} of ${num(N)} sent to be drawn a frame, in ${num(sum.draws / sum.n)} draws` : posed;
    },
    dispose() { crowd?.dispose(); folk.removeFromParent(); folk.clear(); twins = []; members = []; clear(v); },   // (the people's shapes are the kit's own: not freed here)
  };
}

/* ---------- field: ground that takes marks ---------- */
function field({ gs, size }) {
  const T = gs.THREE, { human, creature, vehicle } = gs.models, { Land, Marks, Wind } = gs.outdoors, N = Math.max(2, Math.round(8 * size)), { v, sun } = view(gs, 260, .002);
  // gentle ground: sand to the west, bare earth to the east, grass between them
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lie = (x, z) => .25 * Math.sin(x * .21 + 1) * Math.sin(z * .17) + .06 * Math.sin(x * .8) * Math.cos(z * .7);
  const sand = (x, z) => 1 - sm(-5, -3.6, x + .8 * Math.sin(z * .5)), mud = (x, z) => sm(3.6, 5, x + .8 * Math.sin(z * .45 + 2)), grass = (x, z) => (1 - sand(x, z)) * (1 - mud(x, z));
  const land = new Land({ kind: lie, size: 120, segments: Math.max(24, Math.round(120 * Math.sqrt(size))), material: new T.MeshStandardMaterial({ color: '#ffffff', roughness: .95, vertexColors: true }) }); v.scene.add(land.object);
  { const g = land.mesh.geometry, n = g.attributes.position.count, w = land.segments + 1, s = land.size / land.segments, col = new Float32Array(n * 3), cs = new T.Color('#cdb684'), cm = new T.Color('#4a3d2e'), cg = new T.Color('#55662f'), c = new T.Color();
    for (let i = 0; i < n; i++) { const x = -land.size / 2 + (i % w) * s, z = -land.size / 2 + Math.floor(i / w) * s; c.copy(cg).lerp(cs, sand(x, z)).lerp(cm, mud(x, z)); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new T.BufferAttribute(col, 3)); }
  const wind = new Wind({ x: 2.2, z: .8 }); land.wind = wind;
  // (no roofs here: the weather lies on everything, and keeps no map of what the sky can see)
  const weather = new gs.sky.Weather(v, { kind: 'clear', level: true, wind });
  const marks = new Marks(v, { land, weather, sand, mud, grass, wind });
  land.meadow({ reach: 14, gap: .32, height: .4, blades: 8, where: grass });
  // who goes round it, each on a ring of its own, so that a run by the clock sees the same field whatever its frame rate
  const SPECS = [{ seed: 11, strands: false }, { seed: 12, sex: 'f', hairStyle: 'bun', body: '#8a3a3a', legs: '#30364a', strands: false }], DOG = { like: 'dog', fur: false };
  const who = [], ring = (thing, r, sp, a0, dir, o = {}) => { who.push({ thing, r, sp, a0, dir, ...o }); v.scene.add(thing); marks.watch(thing, o.watch || {}); return thing; };
  ring(vehicle('car', { style: 'jeep', seed: 4 }), 12.5, 4, 3.6, 1, { car: true });
  if (size >= .5) ring(vehicle('tank', { seed: 2 }), 15.5, 2.4, 1, -1, { car: true });
  const place = (w, t, dt) => {
    const a = w.a0 + w.dir * w.sp * t / w.r, x = w.r * Math.cos(a), z = w.r * Math.sin(a), vx = -Math.sin(a) * w.dir, vz = Math.cos(a) * w.dir, th = w.thing;
    th.position.set(x, land.height(x, z), z); th.rotation.y = Math.atan2(vx, vz) + (w.car ? Math.PI : 0);
    if (w.human) { th.rig.blend({ idle: 0, walk: 1.4, jog: 3.4, run: 5.6 }, w.sp); th.rig.update(dt, { speed: w.sp }); th.see(v.cam, 800); }
    else if (w.dog) th.move(dt, w.sp, {});
    else th.move(dt, w.sp, { steer: -w.dir * .3 });
    th.updateMatrixWorld(true);
  };
  // the people are sculpted the first time a phone meets them (kept on it afterwards)
  let made = null, on = false;
  const make = draw => made ||= (async () => {
    const t0 = performance.now(); let done = false, err = null;
    Promise.all([human.ready(SPECS), creature.ready([DOG])]).then(() => { done = true; }, e => { err = e; done = true; });
    await until(draw, () => done); if (err) throw err; if (!done) throw new Error('the people were not sculpted in time');
    const src = [human(SPECS[0]), human(SPECS[1])];
    for (let i = 0; i < N; i++) ring(i < 2 ? src[i] : src[i % 2].twin(), 9.5 - i * .9, 1.3 + (i % 3) * .12, i * 2.4, i % 2 ? -1 : 1, { human: true });
    ring(creature(DOG), 5.2, 2.4, .5, 1, { dog: true, watch: { feet: 4, size: .075, shape: 'paw', gap: .16, long: .5, pace: .42, press: .6, radius: .25 } });
    return performance.now() - t0;
  })();
  const enter = key => async draw => { const first = !made, build = await make(draw); on = key === 'on'; marks.clear(); sum.t = 1e9; for (let i = 0; i < 4; i++) await draw(); return first ? { build, note: 'two people and a dog sculpted' } : null; };
  const sum = { n: 0, ms: 0, t: 1e9 }, lead = new T.Vector3(), ahead = new T.Vector3();
  return {
    v, holds: `${num(N)} people, a dog${size >= .5 ? ', a jeep and a tank' : ' and a jeep'} going round a field of sand, grass and bare earth, in snow, then on wet earth, then dry`,
    modes: [
      { key: 'off', name: 'ground that takes no marks', enter: enter('off') },
      { key: 'on', name: 'prints, tracks, parted grass', enter: enter('on') },
    ],
    // The weather goes round every 18 seconds: snow lying, a thaw to wet earth, drying out, snow again. The
    // camera walks behind the first of the people, looking down at the ground ahead of them.
    path(t, cam) {
      const back = t < sum.t, dt = back ? 0 : Math.min(1, t - sum.t), c = t % 18;
      if (back) { sum.n = sum.ms = 0; marks.clear(); }
      sum.t = t;
      weather.snow = 1 - sm(5, 6.5, c) + sm(16.5, 18, c); weather.wet = sm(5, 6.5, c) - sm(11, 12.5, c); weather.pools = .5 * weather.wet;
      for (const w of who) place(w, t, dt);
      const w0 = who.find(w => w.human) || who[0], a = w0.a0 + w0.dir * w0.sp * t / w0.r, hx = -Math.sin(a) * w0.dir, hz = Math.cos(a) * w0.dir;
      lead.copy(w0.thing.position); cam.position.set(lead.x - hx * 3.2 - hz * 1.1, lead.y + 1.7, lead.z - hz * 3.2 + hx * 1.1); ahead.set(lead.x + hx * 1.6, lead.y + .3, lead.z + hz * 1.6); cam.lookAt(ahead);
      cam.updateMatrixWorld(); sun.follow(cam.position.x, 0, cam.position.z);
      wind.update(dt); weather.update(dt);
      if (on) { const t0 = performance.now(); marks.update(dt, cam.position); sum.ms += performance.now() - t0; sum.n++; }
      land.update(dt, cam);
    },
    tell() { return on && sum.n ? `${num(marks.count)} marks kept, ${num(marks.drawn)} tiles of them drawn, made in ${(sum.ms / sum.n).toFixed(2)} ms a frame` : null; },
    dispose() { marks.dispose(); weather.dispose(); land.meadow(false); for (const w of who) w.thing.removeFromParent(); clear(v); },   // (the people's and vehicles' shapes are the kit's own: not freed here)
  };
}

/* ---------- yard: smoke and fire that flow ---------- */
function yard({ gs, size, gpu }) {
  const T = gs.THREE, { Gas } = gs.gas, { v, sun } = view(gs, 140, .004);
  const stone = gs.hd.pbr('#8d8a84', { rough: .9 }), wood = gs.hd.pbr('#5a3a22', { rough: .85 }), iron = gs.hd.pbr('#3a3d42', { rough: .55, metal: .6 }), brick = gs.hd.pbr('#8a4a3a', { rough: .9 });
  const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; v.scene.add(m); return m; };
  const ground = add(new T.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), gs.hd.pbr('#6f6a5e', { rough: .95 }), 0, 0, 0); ground.castShadow = false;
  // a yard with walls on two sides: a camp fire under a beam on two posts, a chimney, a burning drum
  add(new T.BoxGeometry(12, 3.4, .4), stone, 0, 1.7, -4.4); add(new T.BoxGeometry(.4, 3.4, 9), stone, -5.4, 1.7, 0);
  add(new T.CylinderGeometry(.09, .09, 1.3, 8).rotateZ(1.2), wood, -1.6, .15, .4); add(new T.CylinderGeometry(.09, .09, 1.3, 8).rotateZ(-1.2).rotateY(1), wood, -1.6, .15, .4);
  add(new T.BoxGeometry(2.4, .4, .6), wood, -1.6, 2.5, .4); add(new T.BoxGeometry(.16, 2.4, .16), wood, -2.7, 1.2, .4); add(new T.BoxGeometry(.16, 2.4, .16), wood, -.5, 1.2, .4);
  add(new T.BoxGeometry(.7, 2.4, .7), brick, 2.4, 1.2, -1.8); add(new T.CylinderGeometry(.32, .32, .9, 16), iron, 1.6, .45, 1.6);
  // the gas of the run that is on: none, the smaller version (soft puffs, in JavaScript), or the gas on the graphics chip
  const BOX = [-4.2, 0, -3.4, 4.2, 6.2, 3.2], k = Math.min(1, Math.max(.12, size));
  let gas = null;
  const set = key => {
    gas?.dispose(); gas = null; if (key === 'none') return;
    gas = new Gas(v, { box: BOX, kind: 'fire', lamp: true, gpu: key === 'chip', cells: size >= 1 ? undefined : Math.round((key === 'chip' ? Gas.max() : 12000 * 2.5) * k) });
    gas.fire({ x: -1.6, y: .25, z: .4, size: 1.1 }); gas.box({ x: -1.6, y: 2.5, z: .4, w: 2.4, h: .4, d: .6 });   // (its flames and smoke go round the beam)
    gas.smoke({ x: 2.4, y: 2.6, z: -1.8, size: .9, rate: 1.6, heat: .8, tint: .5 });
    gas.fire({ x: 1.6, y: 1, z: 1.6, size: .6, power: .8 }); gas.tube({ x: 1.6, y: .45, z: 1.6, r: .32, h: .9 });
  };
  const sum = { n: 0, ms: 0, t: 1e9, next: 3 };
  const enter = key => async draw => { set(key); sum.t = 1e9; for (let i = 0; i < 6; i++) await draw(); };
  return {
    v, holds: 'a camp fire under a beam, a chimney smoking in a wind that swings round, a burning drum and an explosion every seven seconds',
    modes: [
      { key: 'none', name: 'no smoke or fire', enter: enter('none') },
      { key: 'puffs', name: 'the smaller version', enter: enter('puffs') },
      ...(gpu ? [{ key: 'chip', name: 'on the graphics chip', enter: enter('chip') }] : []),
    ],
    pairs: gpu ? [['none', 'puffs', 'the smaller version (soft puffs) against no smoke or fire'], ['none', 'chip', 'the gas on the graphics chip against no smoke or fire'], ['puffs', 'chip', 'on the graphics chip against the smaller version']]
      : [['none', 'puffs', 'the smaller version (soft puffs) against no smoke or fire']],
    // the camera swings round the open side of the yard; the gas takes its steps by the clock, so every run sees the same fire
    path(t, cam) {
      const back = t < sum.t, dt = back ? 0 : Math.min(.1, t - sum.t), a = .9 + .7 * Math.sin(t * .25);
      if (back) { sum.n = sum.ms = 0; sum.next = 3; gas?.clear(); }
      sum.t = t;
      cam.position.set(Math.sin(a) * 8, 2.1 + .4 * Math.sin(t * .3), Math.cos(a) * 8); cam.lookAt(-.2, 2, -.2); cam.updateMatrixWorld(); sun.follow(0, 0, 0);
      if (!gas) return;
      gas.wind.x = .9 * Math.sin(t * .35); gas.wind.z = .3 * Math.cos(t * .23);
      if (t >= sum.next) { sum.next += 7; gas.burst(.3, .8, -1.2, { size: 1.8 }); }
      const t0 = performance.now(); gas.update(dt); sum.ms += performance.now() - t0; sum.n++;
    },
    tell() {
      if (!gas || !sum.n) return null;
      const cells = `${num(gas.cells)} cells of ${Math.round(gas.cell * 100)} cm`, ms = `${(sum.ms / sum.n).toFixed(2)} ms of the kit's code a frame`;
      return gas.backend === 'gpu' ? `${cells} on the graphics chip, ${ms}` : `${cells} in JavaScript, ${num(gas.puffs.shown || 0)} puffs drawn, ${ms}`;
    },
    dispose() { gas?.dispose(); gas = null; clear(v); },
  };
}

/* ---------- cliff: land with cliffs, caves and overhangs ---------- */
function cliff({ gs, size }) {
  const T = gs.THREE, { human } = gs.models, { Land, looks } = gs.outdoors, { v, sun } = view(gs, 320, .0015), amb = v.hemi.intensity;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // a valley in the west, a plateau in the east, a cliff between them that wanders, and a spur that stands out of it
  const lie = (x, z) => 16 * sm(-5, 5, x + 6 * Math.sin(z * .05) + 3 * Math.sin(z * .13 + 1) + 14 * Math.exp(-(((z - 10) / 9) ** 2)) - 4) + .8 * Math.sin(x * .07) * Math.cos(z * .06) + .3 * Math.sin(x * .19 + 2) * Math.sin(z * .23);
  const land = new Land({ kind: lie, size: 160, segments: Math.max(32, Math.round(96 * Math.sqrt(size))), colours: [[-2, '#6f7d43'], [3, '#63783a'], [9, '#857f66'], [15, '#5f7436'], [19, '#6f7d43']] }); v.scene.add(land.object);
  // the rock: beds and ledges where the land is steep, a cave under the spur from the valley on one side of it to
  // the valley on the other, an arch on the valley floor and a shelf that stands out of the cliff
  const ROCK = { seed: 3, cell: size >= .5 ? .4 : .8,
    caves: [{ path: [[-3, lie(-3, -6) + 2.1, -5], [-4.5, lie(-3, -6) + 2.3, 10], [-3, lie(-3, 32) + 2.1, 31]], radius: 2.6 }],
    shapes: [{ arch: [9, 5.5, 2.2, 3], at: [-22, lie(-22, 28) - .5, 28], turn: .5 }, { box: [8, 1.8, 6], at: [8.5, 10, -25], turn: .1 }] };
  // the walk: a ring through the cave and under the arch, a point every quarter of a metre. How high each point
  // is comes from the land as it is in this run (land.floor(): without the rock the walk goes over the spur).
  const ring = new T.CatmullRomCurve3([[-12, -24], [-5, -14], [-3, -5], [-4.5, 10], [-3, 31], [-8, 38.5], [-18.2, 35], [-22, 28], [-25.8, 21], [-28, 8], [-23, -10]].map(([x, z]) => new T.Vector3(x, 0, z)), true, 'centripetal');
  const LEN = ring.getLength(), NP = Math.round(LEN / .25), pts = ring.getSpacedPoints(NP).slice(0, NP), ys = new Float32Array(NP), sk = new Float32Array(NP), tmp = new Float32Array(NP), SPEED = 4;
  const soften = (a, n) => { for (let pass = 0; pass < 2; pass++) { for (let i = 0; i < NP; i++) { let t = 0; for (let k = -n; k <= n; k++) t += a[(i + k + NP) % NP]; tmp[i] = t / (2 * n + 1); } a.set(tmp); } };
  const lay = () => {
    let y = land.height(pts[0].x, pts[0].z);
    for (let i = 0; i < NP; i++) { ys[i] = y = land.floor(pts[i].x, y, pts[i].z); sk[i] = land.sky(pts[i].x, y + 1.7, pts[i].z); }
    soften(ys, 3); soften(sk, 8);
  };
  // people standing about, for the size of things: at the cave's mouth, in it, under the arch, on the cliff top
  const SPECS = [{ seed: 11, strands: false }, { seed: 12, sex: 'f', hairStyle: 'bun', body: '#8a3a3a', legs: '#30364a', strands: false }], SPOTS = [[-5.5, -9, 2, 2.4], [-3.6, 14, 2, 3], [-21, 26.5, 2, .4], [1.5, 6, 40, -1.9]];
  const folk = []; let made = null, on = false, rockMs = 0;
  const make = draw => made ||= (async () => {
    const t0 = performance.now(); let done = false, err = null;
    human.ready(SPECS).then(() => { done = true; }, e => { err = e; done = true; });
    await until(draw, () => done); if (err) throw err; if (!done) throw new Error('the people were not sculpted in time');
    const src = SPECS.map(o => human(o));
    SPOTS.forEach(([x, z, , turn], i) => { const p = i < 2 ? src[i] : src[i % 2].twin(); p.position.set(x, 0, z); p.rotation.y = turn; v.scene.add(p); folk.push(p); });
    return performance.now() - t0;
  })();
  const enter = key => async draw => {
    const first = !made, build = await make(draw); on = key === 'on'; let ms = null;
    land.meadow(false);
    if (on) { const t0 = performance.now(), fresh = !rockMs; land.rocks(ROCK); looks.rock(land.rock.material, { mossy: 0 }); if (fresh) ms = rockMs = Math.max(1, performance.now() - t0); }
    else land.rocks(false);
    land.meadow({ reach: 14, gap: .34, height: .4, blades: 8 });   // (planted again: grass keeps off the rock)
    lay(); SPOTS.forEach(([x, z, y], i) => { folk[i].position.y = land.floor(x, lie(x, z) < 6 ? lie(x, z) + y : y, z); folk[i].updateMatrixWorld(true); });
    for (let i = 0; i < 4; i++) await draw();
    return ms != null ? { build: ms + (first ? build : 0), note: `rock of ${num(land.rock.tris)} triangles made` + (first ? ', two people sculpted' : '') } : first ? { build, note: 'two people sculpted' } : null;
  };
  const at = (d, out) => { const f = ((d / LEN) % 1 + 1) % 1 * NP, i = Math.floor(f) % NP, j = (i + 1) % NP, u = f - Math.floor(f); out.set(pts[i].x + (pts[j].x - pts[i].x) * u, ys[i] + (ys[j] - ys[i]) * u, pts[i].z + (pts[j].z - pts[i].z) * u); return sk[i] + (sk[j] - sk[i]) * u; };
  const eye = new T.Vector3(), ahead = new T.Vector3(); let last = 1e9;
  return {
    v, holds: 'a walk along the foot of a cliff, through a cave under a spur and under an arch, four people standing about',
    modes: [
      { key: 'off', name: 'the height map alone', enter: enter('off') },
      { key: 'on', name: 'cliffs, a cave, an arch', enter: enter('on') },
    ],
    path(t, cam) {
      const dt = t < last ? 0 : Math.min(1, t - last); last = t;
      const light = at(t * SPEED, eye); at(t * SPEED + 5, ahead);
      cam.position.set(eye.x, eye.y + 1.7, eye.z); cam.lookAt(ahead.x, ahead.y + 1.5, ahead.z); cam.updateMatrixWorld(); sun.follow(eye.x, eye.y, eye.z);
      v.hemi.intensity = amb * (.3 + .7 * light);   // (a game dims its own fill light in a cave: land.sky() says by how much)
      for (const p of folk) { p.rig.blend({ idle: 0, walk: 1.4 }, 0); p.rig.update(dt, { speed: 0 }); p.see(v.cam, 800); }
      land.update(dt, cam);
    },
    tell() { return on && land.rock ? `rock of ${num(land.rock.tris)} triangles in ${num(land.rock.pieces)} pieces, its numbers worked out in ${num(land.rock.ms)} ms` : null; },
    dispose() { land.meadow(false); land.rocks(false); for (const p of folk) p.removeFromParent(); v.hemi.intensity = amb; clear(v); },   // (the people's shapes are the kit's own: not freed here)
  };
}

/* ---------- parade: smaller meshes ---------- */
function parade({ gs, HD, size }) {
  const T = gs.THREE, { human, creature, vehicle } = gs.models, N = Math.max(2, Math.round(8 * size)), { v, sun } = view(gs, 200, .002);
  const ground = new T.Mesh(new T.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), gs.hd.pbr('#8a8478', { rough: .95 })); ground.receiveShadow = true; v.scene.add(ground);
  // each a person of their own (a face, a build and colours of their own), as a squad's are: so each keeps points of its own
  const TOPS = ['#5a6648', '#6a5a48', '#4a5a6a', '#7a4a3a'];
  const SPECS = Array.from({ length: N }, (_, i) => ({ seed: 31 + i, body: TOPS[i % 4], ...(i % 3 === 1 ? { sex: 'f', hairStyle: 'bun' } : {}) })), BEASTS = [{ like: 'dog', seed: 3 }, { like: 'horse', seed: 5 }];
  const line = new T.Group(); v.scene.add(line);
  let ready = false, mode = '', figures = [], bytes = null, last = 0;
  const stand = () => {
    const out = [], half = (N - 1) / 2 * 1.1;
    SPECS.forEach((s, i) => { const f = human(s); f.position.set(i * 1.1 - half, 0, i % 2 ? -.5 : 0); f.rotation.y = (i % 3 - 1) * .3; f.rig.play('idle'); line.add(f); out.push(f); });
    BEASTS.forEach((s, i) => { const f = creature(s); f.position.set((i ? 1 : -1) * (half + 1.9), 0, .3); f.rotation.y = i ? -.9 : .9; line.add(f); out.push(f); });
    const train = vehicle('train', { style: 'steam', seed: 2, fuse: true, cars: ['van', { style: 'open', load: 'coal' }, 'guard'] }); train.position.set(-6, 0, -9); train.rotation.y = Math.PI / 2; line.add(train);
    return out;
  };
  const drop = () => { const seen = new Set(); line.traverse(o => { if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } }); line.clear(); figures = []; };
  // each run makes them again its own way: the people are sculpted the first time a phone meets them (kept on it afterwards)
  const enter = key => async draw => {
    let build = null;
    if (!ready) {
      const t0 = performance.now(); let done = false, err = null;
      Promise.all([human.ready(SPECS), creature.ready(BEASTS)]).then(() => { done = true; }, e => { err = e; done = true; });
      await until(draw, () => done); if (err) throw err; if (!done) throw new Error('the people were not sculpted in time');
      ready = true; build = performance.now() - t0;
    }
    drop();
    const was = HD.slim; HD.slim = key === 'on';
    try { figures = stand(); } finally { HD.slim = was; }
    mode = key; last = 0;
    for (let i = 0; i < 4; i++) await draw();
    bytes = HD.meshBytes(line);   // (after they have drawn: on WebGPU three.js widens a plain list of bone numbers when it first sends it)
    return build != null ? { build, note: `${num(N)} people, a dog and a horse sculpted` } : null;
  };
  const mb = n => (n / 1048576).toFixed(1);
  return {
    v, holds: `${num(N)} people, each their own, a dog, a horse and a goods train, close up`,
    modes: [
      { key: 'off', name: 'plain floats', enter: enter('off') },
      { key: 'on', name: 'kept small', enter: enter('on') },
    ],
    // a slow walk along the line and back, an arm's length from their faces, stepping back now and then to take in the train
    path(t, cam) {
      const span = N * 1.1 + 5, u = (t * .5) % (span * 2), x = (u < span ? u : span * 2 - u) - span / 2, far = .5 - .5 * Math.cos(t * .21);
      cam.position.set(x, 1.55 + far * 1.2, 2.1 + far * 6); cam.lookAt(x * (1 - far * .6), 1.35, -far * 4); sun.follow(cam.position.x, 0, 0);
      const dt = t > last ? Math.min(.1, t - last) : 0; last = t; cam.updateMatrixWorld();
      for (const f of figures) { if (f.move) f.move(dt, 0); else f.rig.update(dt); f.see?.(cam, 800); }
    },
    tell() { return bytes ? `${num(bytes.points)} points: ${mb(bytes.js)} MB in memory, ${mb(bytes.chip)} MB on the graphics chip` : null; },
    dispose() { drop(); clear(v); },
  };
}

/** The scenes, in the order they run: [key, name, what it tries, make({ gs, HD, size, gpu })]. */
export const SCENES = [
  ['valley', 'Valley', 'cluster detail', valley],
  ['forest', 'Forest', 'detail for copies', forest],
  ['village', 'Village', 'real surface detail', village],
  ['town', 'Town', 'hiding what is behind other things, and shadows in tiles', town],
  ['square', 'Square', 'crowds', square],
  ['field', 'Field', 'ground that takes marks', field],
  ['yard', 'Yard', 'smoke and fire that flow', yard],
  ['cliff', 'Cliff', 'land with cliffs, caves and overhangs', cliff],
  ['parade', 'Parade', 'smaller meshes', parade],
];
