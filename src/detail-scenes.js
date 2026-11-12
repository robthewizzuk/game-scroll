// Engine test scenes: heavy scenes made in code, each flown through with one of the Next Gen engine's
// detail systems off and then on, so a phone can say what the system is worth on its own graphics chip.
// src/detail-tour.js runs them (QA panel › Phone test tour › Engine test scenes). The automatic checks
// (scripts/detail-test.cjs) draw scenes like these on a build machine's software renderer, which can
// count triangles and compare pictures but can't time a phone.
//   valley   cluster detail (src/kit/detail.js): a hillside, rocks and brick houses of dense triangles
//   forest   detail for copies (hd3d.js autoCopies): thousands of firs and rocks placed with gs.props
//   village  real surface detail (gs.models.relief): a street of houses whose bricks and tiles are real triangles
// A scene: { v (its view), holds (what is in it, in words), modes: [{ key, name, enter(draw) }], path(t, cam),
// tell() (a few words about the run just flown), dispose() }, and where it has more than one pair of runs to set
// side by side, pairs: [[off key, on key]]. enter() sets the mode up and, where something has to be built
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

/** The scenes, in the order they run: [key, name, what it tries, make({ gs, HD, size, gpu })]. */
export const SCENES = [
  ['valley', 'Valley', 'cluster detail', valley],
  ['forest', 'Forest', 'detail for copies', forest],
  ['village', 'Village', 'real surface detail', village],
];
