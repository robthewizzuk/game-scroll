// What each kit's update costs in code time, with no browser and no graphics chip: one small set-up of each kit that
// runs on the CPU, stepped a few thousand times. For finding the kit whose own code is slow and for checking a change
// made it faster; what the graphics chip does is not here (scripts/perf-bench.cjs, scripts/scene-probe.cjs).
//   node scripts/kit-bench.mjs [name ...] [--json out.json] [--vs base.json]
import fs from 'node:fs';
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const out = opt('--json'), vs = opt('--vs'), only = argv.filter(a => !a.startsWith('--'));
globalThis.HTMLCanvasElement ??= class {}; globalThis.Image ??= class {};
const THREE = await import('three'), { together } = await import('../src/kit/links.js');
const { World3D, loadPhysics3D } = await import('../src/kit/physics3d.js'); await loadPhysics3D();
const { Physics, loadPhysics } = await import('../src/kit/physics.js'); await loadPhysics();
const { Wind, Land, Cloth, Marks, Water, Sea } = await import('../src/kit/outdoors.js'), { Weather, Sky } = await import('../src/kit/sky.js'), { Gas } = await import('../src/kit/gas.js'), { Fluid } = await import('../src/kit/fluid.js');
const { Structure } = await import('../src/kit/structure.js'), { Particles } = await import('../src/kit/hd3d.js'), { skeleton } = await import('../src/kit/models/human.js');
const { Crowd, NavGrid } = await import('../src/kit/ai.js'), { Senses } = await import('../src/kit/senses.js'), { TileMap } = await import('../src/kit/tiles.js'), { Platformer } = await import('../src/kit/movers.js');
const { Juice } = await import('../src/kit/juice.js'), { Things } = await import('../src/kit/things.js'), { Bullets } = await import('../src/kit/bullets.js'), { Sand } = await import('../src/kit/sand.js');
const view = () => ({ cam: Object.assign(new THREE.PerspectiveCamera(50, 1, .1, 100), {}), scene: new THREE.Scene(), hemi: null, parts: [], _air: null, air() { return this._air ||= { wet: 0, world: null }; } });
const dt = 1 / 60, M = () => new THREE.MeshBasicMaterial();
const BENCH = {
  'wind': () => { const w = new Wind({ x: 4, z: 1, gust: .4 }); return () => w.update(dt); },
  'cloth: a flag and a washing line': () => { const c = new Cloth(null, { wind: new Wind({ x: 5, link: false }), link: false }); c.flag({ at: [0, 5, 0], size: [1.8, 1.2] }); c.line({ from: [1, 2, 0], to: [5, 2, 0], items: 3 }); return () => c.update(dt); },
  'weather: rain, 1400 drops': () => { const v = view(), w = new Weather(v, { kind: 'rain', amount: 1, max: 1400, link: false }); return () => w.update(dt); },
  'weather: snow, 1400 flakes': () => { const v = view(), w = new Weather(v, { kind: 'snow', amount: 1, max: 1400, link: false }); return () => w.update(dt); },
  'water: a pond with ripples': () => { const w = new Water({ level: 0, size: 8, segments: 28, waves: .05, ripples: true, link: false }); let i = 0; return () => { if (i++ % 30 === 0) w.splash({ x: 1, y: 0, z: 1 }, { size: .5 }); w.update(dt, { x: 0, y: 0, z: 0 }); }; },
  'water: 200 heights': () => { const w = new Water({ level: 0, size: 40, segments: 40, waves: .3, link: false }); w.update(dt); let s = 0; return () => { for (let i = 0; i < 200; i++) s += w.height(i * .2, i * .13); return s; }; },
  'marks: sand, a walker': () => { const v = view(), m = new Marks(v, { sand: () => 1, grass: false, link: false }); let t = 0; let i = 0; return () => { t += dt; if (i++ % 20 === 0) m.step(Math.sin(t * .3) * 6, Math.cos(t * .3) * 6, { turn: t, side: i % 40 ? 1 : -1 }); m.update(dt); }; },
  'gas: smoke on the CPU': () => { const v = view(), g = new Gas(v, { box: [0, 0, 0, 8, 6, 8], kind: 'smoke', gpu: false, link: false }); g.smoke({ x: 0, y: .5, z: 0, size: .8, rate: 2, heat: 1 }); return () => g.update(dt); },
  'fluid: 600 drops on the CPU': () => { const v = view(), f = new Fluid(v, { box: [0, 0, 0, 4, 4, 4], gpu: false, drops: 600, link: false }); f.fill({ y1: 1 }); return () => f.update(dt); },
  'structure: a wall of 60 pieces, hit': () => { const sc = new THREE.Scene(), s = new Structure(sc, { pieces: Array.from({ length: 60 }, (_, i) => ({ size: [.8, .5, .4], at: [(i % 10) * .8, .25 + (i / 10 | 0) * .5, 0], material: 'brick' })), materials: { brick: M() }, link: false }); let i = 0; return () => { if (i++ % 240 === 0) { s.reset(); s.hit({ x: 3, y: .6, z: 0 }, { power: 6, radius: 1.2 }); } s.update(dt); }; },
  'physics 3D: 60 boxes': () => { const w = new World3D({ link: false }); w.floor(0); for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), M()); m.position.set((i % 6) * .6, .3 + (i / 6 | 0) * .6, 0); w.box(m, .5, .5, .5); } return () => w.step(dt); },
  'physics 3D: 200 rays': () => { const w = new World3D({ link: false }); w.floor(0); for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M()); m.position.set((i % 6) * 2, .5, (i / 6 | 0) * 2); w.box(m, 1, 1, 1, { fixed: true }); } w.step(dt); const o = new THREE.Vector3(-3, .5, 1), d = new THREE.Vector3(1, 0, 0); let n = 0; return () => { for (let i = 0; i < 200; i++) { o.z = (i % 10) * .5; if (w.ray(o, d, 30)) n++; } return n; }; },
  'physics 2D: 60 boxes': () => { const p = new Physics({ gravity: 600, link: false }); p.walls(0, 0, 360, 640); for (let i = 0; i < 60; i++) p.box(40 + (i % 8) * 34, 60 + (i / 8 | 0) * 34, 28, 28); return () => p.step(dt); },
  'a person: rig and live face': () => { const p = skeleton({}); let i = 0; return () => { p.rig.update(dt); if (i++ % 4 === 0) p.updateMatrixWorld(true); }; },
  'a person walking: rig, steps, face': () => { const p = skeleton({}); let i = 0; return () => { p.position.x += 1.4 * dt; p.rig.update(dt, { speed: 1.4 }); if (i++ % 2 === 0) p.updateMatrixWorld(true); }; },
  'particles 3D: 600': () => { const v = view(), p = new Particles(v, { max: 600, additive: false, wind: false }); let i = 0; return () => { for (let k = 0; k < 4; k++) p.emit({ x: i++ % 7, y: 2, z: 0, vy: -.4, life: 2.4, size: .1, color: '#fff', grav: .3 }); p.update(dt); }; },
  'crowd 2D: 80 chasers on a grid': () => { const nav = new NavGrid(40, 40, 16), c = new Crowd({ link: false }), t = { x: 300, y: 300 }; for (let i = 0; i < 80; i++) c.add(20 + (i % 10) * 30, 20 + (i / 10 | 0) * 30).hunt(t, nav); let k = 0; return () => { k += dt; t.x = 320 + Math.sin(k) * 200; c.update(dt); }; },
  'senses: 12 guards, one player': () => { const map = TileMap.fromText(Array.from({ length: 20 }, (_, y) => Array.from({ length: 20 }, (_, x) => (x % 5 === 2 && y % 4 !== 1) ? '#' : '.').join('')).join('\n'), 16), sees = (ax, ay, bx, by) => map.sees(ax, ay, bx, by), guards = Array.from({ length: 12 }, (_, i) => ({ s: new Senses({ link: false }), me: { x: 20 + i * 24, y: 40 + (i % 3) * 80, angle: i } })); const pl = { x: 160, y: 160 }; let k = 0; return () => { k += dt; pl.x = 160 + Math.sin(k) * 120; for (const g of guards) g.s.update(dt, g.me, pl, { sees }); }; },
  'platformer on tiles': () => { const map = TileMap.fromText(['....................', '....................', '..........###.......', '....................', '####################'].join('\n'), 16), h = new Platformer({ x: 40, y: 20, w: 12, h: 14, link: false }); let i = 0; return () => { h.update(dt, map, { x: (i++ >> 6) % 2 ? 1 : -1, jump: i % 50 === 0 }); }; },
  'effects 2D: bursts, pops, shake': () => { const j = new Juice(); let i = 0; return () => { if (i++ % 12 === 0) { j.burst(100, 100, { n: 14 }); j.pop(100, 100, '+10'); j.shake(4); } j.update(dt); }; },
  'things: 200 against 40': () => { const t = new Things(); for (let i = 0; i < 200; i++) t.add({ x: (i * 37) % 360, y: (i * 91) % 640, r: 6 }, 'shot'); for (let i = 0; i < 40; i++) t.add({ x: (i * 53) % 360, y: (i * 71) % 640, r: 12 }, 'foe'); let n = 0; return () => { t.hits('shot', 'foe', () => { n++; }); return n; }; },
  'bullets: 2000': () => { const b = new Bullets({ max: 2000, w: 360, h: 640 }); let i = 0; return () => { for (let k = 0; k < 30; k++) b.fire?.(180, 320, Math.cos(i) * 80, Math.sin(i++) * 80); b.update(dt); }; },
  'sand: 160 x 160': () => { const s = new Sand({ w: 160, h: 160 }); for (let x = 20; x < 140; x++) for (let y = 10; y < 60; y++) s.set?.(x, y, 'sand'); let i = 0; return () => { s.set?.(80, 5, i++ % 2 ? 'sand' : 'water'); s.update(dt); }; },
};
const res = {};
for (const [name, make] of Object.entries(BENCH)) {
  if (only.length && !only.some(o => name.includes(o))) continue;
  try {
    let run; together(() => { run = make(); });
    for (let i = 0; i < 300; i++) run();
    let best = Infinity, n = 0;
    for (let rep = 0; rep < 5; rep++) { const t0 = performance.now(); let k = 0; do { run(); k++; } while (performance.now() - t0 < 250); best = Math.min(best, (performance.now() - t0) / k * 1000); n += k; }
    res[name] = best;
  } catch (e) { res[name] = null; console.log(`${name.padEnd(38)} failed: ${String(e && e.message).split('\n')[0]}`); }
}
const base = vs ? JSON.parse(fs.readFileSync(vs, 'utf8')) : null;
for (const [name, us] of Object.entries(res)) if (us != null) console.log(`${name.padEnd(38)} ${us < 100 ? us.toFixed(1) : us.toFixed(0)} microseconds a frame${base?.[name] ? `   (${us < base[name] ? '-' : '+'}${Math.abs(100 * (us - base[name]) / base[name]).toFixed(0)}% against ${base[name] < 100 ? base[name].toFixed(1) : base[name].toFixed(0)})` : ''}`);
if (out) fs.writeFileSync(out, JSON.stringify(res));
process.exit(0);
