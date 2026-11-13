// gs.models.vehicle(kind, options): cars, lorries, tanks, trains, boats and planes made in code, so a game
// needs no model files. Each is worked out from a few measures into a shell skinned over cross-sections
// (vehicle-shapes.js), dressed in paint, glass, chrome and rubber, aged with wear(), and comes back as a Group
// with the parts that turn as their own pivots: wheels that roll and steer, a turret and gun, tracks that run,
// propellers, a rudder. Its nose points along -z, the way gs.vehicles, gs.craft and World3D.vehicle push
// things, and a road vehicle stands on y = 0 (a boat floats with its waterline there, a plane's middle is at 0).
// The same vehicle asked for again is a copy sharing its shapes and materials.
// Kit use only: games reach it as gs.models.vehicle.
import { Group, Mesh, Object3D, InstancedMesh, Matrix4, BoxGeometry, BufferAttribute, DynamicDrawUsage } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SLIM, slim } from '../slim.js';
import { pause, built, loading } from '../slices.js';
import { material } from './materials.js';
import { wear } from './wear.js';
import { boxUV } from './props.js';
import { pbr, surface } from '../hd3d.js';
import { rng } from '../math.js';
import { MAKERS as ROAD, KINDS as ROADS } from './vehicle-shapes.js';
import { railcar, RAIL } from './vehicle-rail.js';
import { boat, plane, CRAFT } from './vehicle-craft.js';
import { wheelGeo, wheelsetGeo } from './vehicle-parts.js';
import { carPaint, carGlass } from './vehicle-looks.js';
import { wearAndTear } from './vehicle-damage.js';
import { looksOf } from '../looks.js';

const MAKERS = { ...ROAD, train: o => railcar(o.style, o), boat, plane }, KINDS = { ...ROADS, train: RAIL, ...CRAFT };

const { PI, abs, min, max, tan, sign } = Math, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const hash = n => { let t = (n * 2654435761) >>> 0; t ^= t >>> 15; t = Math.imul(t, 0x2c1b3c6d); t ^= t >>> 12; return (t >>> 0) / 4294967296; };

// the paint: gloss (a new car: clear coat), satin, matt (army, work), worn (chipped to the primer), rusty
const soft = (m, r) => { m.clearcoatRoughness = r; return m; };   // (a mirror-sharp coat turns the sun into one blinding dot)
const finish = (colour, f) => f === 'gloss' ? soft(pbr(colour, { rough: .45, metal: .15, clear: .5 }), .32) : f === 'satin' ? pbr(colour, { rough: .45, metal: .1 })
  : f === 'worn' ? material('paint', { colour, under: '#77726a' }) : f === 'rusty' ? material('rust', { colour }) : pbr(colour, { rough: .72 });
// every material slot a shape can ask for (k: the vehicle's look)
const SLOTS = {
  paint: k => finish(k.colour, k.finish), paint2: k => finish(k.trim, k.finish === 'gloss' ? 'satin' : k.finish),
  under: () => pbr('#141516', { rough: .92 }), dark: () => pbr('#1b1c1f', { rough: .55 }), rubber: () => pbr('#18181a', { rough: .85 }),
  // (glass: a closed cabin's, dark; with its inside made, see-through as glass is, its look making it a mirror edge on)
  glass: k => k.inside ? pbr('#26323a', { rough: .04, transparent: true, opacity: .42, depthWrite: false }) : pbr('#0a0f13', { rough: .26 }), screen: () => pbr('#b9cdd4', { rough: .08, transparent: true, opacity: .3, depthWrite: false }),   // (glass: a closed cabin's, dark; screen: glass with the open air behind it, seen through)
  chrome: () => pbr('#e6e9ec', { rough: .1, metal: 1 }), steel: () => pbr('#5c6064', { rough: .42, metal: .85 }), iron: () => pbr('#2c2d2f', { rough: .6, metal: .6 }),
  lamp: k => k.lit ? pbr('#fff6e0', { rough: .2, glow: 3 }) : pbr('#f2eee2', { rough: .3 }), tail: k => pbr('#9c1010', { rough: .25, glow: k.lit ? 1.6 : 0 }),
  plate: () => pbr('#e6e3d6', { rough: .5 }), seat: k => pbr(k.seat || '#4a3c2a', { rough: .9 }),
  // a closed car's inside: the door cards and pillars, the headliner, the floor, the dashboard, its dials (lit with the lamps)
  lining: () => pbr('#2e2f32', { rough: .88 }), liner: () => pbr('#9d9890', { rough: .95 }), carpet: () => pbr('#1c1d1f', { rough: .98 }), dash: () => pbr('#232428', { rough: .62 }),
  dials: k => pbr('#182024', { rough: .22, glow: k.lit ? .9 : 0, glowCol: '#bfe0ff' }), coal: () => pbr('#0e0e10', { rough: .55 }), bottom: () => pbr('#5c211c', { rough: .8 }), prop: () => pbr('#26272a', { rough: .5, metal: .4 }), blur: () => pbr('#34342f', { rough: .9, transparent: true, opacity: .22, depthWrite: false }), brass: () => pbr('#b08a3c', { rough: .32, metal: 1 }), beam: () => pbr('#96201a', { rough: .6 }),
  wood: () => material('planks', { colour: '#8a6a44' }), canvas: k => pbr(k.canvas || '#5c6040', { rough: .95 }), rust: () => material('rust', {}),
  // a railway's own: boards in a wagon's colour (bare wood with none), bare timber (floors, crates), a tarred roof, copper pipes, oil drums, a fire, riveted plate
  boards: k => { const t = boarding(); return pbr(k.boards || '#8a6a44', { rough: .92, ...(t ? { tex: t } : {}) }); }, tar: () => pbr('#454544', { rough: .96 }), copper: () => pbr('#96603c', { rough: .38, metal: .9 }),
  timber: () => { const t = boarding(); return pbr('#8a6a44', { rough: .92, ...(t ? { tex: t } : {}) }); }, drum: () => pbr('#4c5a32', { rough: .6, metal: .15 }), fire: k => pbr('#ff8a30', { rough: .6, glow: k.lit ? 2.6 : .5 }),
  plates: k => { const m = finish(k.colour, k.finish), t = k.finish === 'worn' || k.finish === 'rusty' ? null : rivets(); return t ? pbr(k.colour, { rough: m.roughness, metal: m.metalness, tex: t }) : m; },
};
// plate with rows of rivets along its seams, a metre a sheet (null where there is no canvas to paint on)
let plateTex;
function rivets() {
  if (plateTex !== undefined) return plateTex;
  if (typeof document === 'undefined') return (plateTex = null);
  const R = rng(77);
  return (plateTex = surface(128, ({ col, h, r, size: Z }) => {
    col.fillStyle = '#e4e4e4'; col.fillRect(0, 0, Z, Z); h.fillStyle = '#7c7c7c'; h.fillRect(0, 0, Z, Z); r.fillStyle = '#a8a8a8'; r.fillRect(0, 0, Z, Z);
    for (let i = 0; i < 70; i++) { const x = R() * Z, y = R() * Z, w = 1 + R() * 3, l = 10 + R() * 60; col.fillStyle = `rgba(${R() < .55 ? '34,28,24' : '255,250,240'},${.03 + R() * .06})`; for (const oy of [0, -Z]) col.fillRect(x, y + oy, w, l); }   // streaks down it
    for (let i = 0; i < 10; i++) for (const [x, y] of [[5, 6.4 + i * 12.8], [6.4 + i * 12.8, 5]]) {   // (the rivets are in the plate's shape, not painted: far off they melt into it)
      h.fillStyle = '#d8d8d8'; h.beginPath(); h.arc(x, y, 1.7, 0, PI * 2); h.fill(); col.fillStyle = 'rgba(0,0,0,.12)'; col.beginPath(); col.arc(x + .6, y + .8, 1.4, 0, PI * 2); col.fill(); }
    h.fillStyle = '#585858'; h.fillRect(0, 0, Z, 1.5); h.fillRect(0, 0, 1.5, Z); col.fillStyle = 'rgba(0,0,0,.2)'; col.fillRect(0, 0, Z, 1); col.fillRect(0, 0, 1, Z);   // the seam
  }, { strength: 2 }));
}
// a wagon's boards, to take its colour: eight to a tile, each a shade of its own, grain along it, a dark gap between two
let boardTex;
function boarding() {
  if (boardTex !== undefined) return boardTex;
  if (typeof document === 'undefined') return (boardTex = null);
  const R = rng(78);
  return (boardTex = surface(128, ({ col, h, r, size: Z }) => {
    h.fillStyle = '#a4a4a4'; h.fillRect(0, 0, Z, Z); r.fillStyle = '#e8e8e8'; r.fillRect(0, 0, Z, Z);
    for (let p = 0; p < 8; p++) {
      const y = p * 16, l = 212 + R() * 43 | 0, hh = 150 + R() * 40 | 0; col.fillStyle = `rgb(${l},${l},${l})`; col.fillRect(0, y, Z, 16); h.fillStyle = `rgb(${hh},${hh},${hh})`; h.fillRect(0, y, Z, 16);
      for (let i = 0; i < 24; i++) { col.fillStyle = `rgba(28,18,10,${.05 + R() * .1})`; const gx = R() * Z, gy = y + 2 + R() * 12, gl = 10 + R() * 50, gw = .7 + R(); for (const ox of [0, -Z]) col.fillRect(gx + ox, gy, gl, gw); }
      col.fillStyle = 'rgba(10,7,5,.8)'; col.fillRect(0, y, Z, 1.6); h.fillStyle = '#202020'; h.fillRect(0, y, Z, 2.2);
    }
  }, { strength: 2.6 }));
}
const AGES = { paint: 1, paint2: 1, plates: 1, wood: .8, boards: .8, timber: .8, canvas: .7, tar: .6, steel: .6, iron: .5, drum: .7, under: 0 };   // (which slots wear() ages, and how much)
const shared = new Map();
// (a car's or a lorry's paint, glass and lamps wear their looks, vehicle-looks.js: theirs are kept apart from a train's, and a paint
// from another style's, as the look knows where the car's sills and tail are)
const keyOf = (slot, k) => slot === 'paint' || slot === 'paint2' || slot === 'plates' ? [k.colour, k.trim, k.finish, k.flakes || 0, k.fit || ''] : slot === 'lamp' || slot === 'tail' || slot === 'fire' || slot === 'dials' ? [k.lit, !!k.fit]
  : slot === 'canvas' ? k.canvas : slot === 'boards' ? k.boards : slot === 'glass' ? [!!k.inside, k.fit || ''] : slot === 'seat' ? k.seat : '';
const matOf = (slot, k) => { const key = slot + '|' + keyOf(slot, k); let m = shared.get(key); if (!m) shared.set(key, m = (SLOTS[slot] || SLOTS.paint)(k)); return m; };
let wheelMat = null; const wheelGeos = new Map();
const wheelOf = g => { const key = JSON.stringify(g); let w = wheelGeos.get(key); if (!w) wheelGeos.set(key, w = g.gauge ? wheelsetGeo(g) : wheelGeo(g)); return w; };

// what each kind looks like when nothing is said: its colours to pick from by seed, its paint, how worn
const LOOKS = {
  car: { colours: ['#a3231c', '#1d4a86', '#d9d7d0', '#202428', '#868b90', '#2c6537', '#d19c17', '#5f2b62', '#bf561b', '#7a9fc2'], finish: 'gloss', wear: .3 },
  truck: { colours: ['#4c5a3c', '#27456b', '#8a2f22', '#b88a1a', '#3c4146', '#c9c5b8', '#2f5d54'], finish: 'satin', wear: .6, trim: '#cfccc0' },
  tank: { colours: ['#4a5236', '#5b5a44', '#6d6a55', '#3f4a3c', '#7a6f52'], finish: 'matt', wear: .8 },
  train: { colours: ['#1d1e20', '#1f4a2c', '#6e1a1a', '#1f3a66'], finish: 'satin', wear: .6, trim: '#8c8a84',
    by: { diesel: { colours: ['#1f4a2c', '#a8301f', '#1f3a66', '#c9a21a', '#b8500f'], trim: '#d8d2bc' }, coach: { colours: ['#6e1a1a', '#1f4a2c', '#1f3a66', '#5a3a1e'] } } },
  boat: { colours: ['#d6d2c6', '#1f4e79', '#8a1f1a', '#2f5d54', '#c9a21a', '#32373c'], finish: 'satin', wear: .5, trim: '#dedbd0',
    by: { patrol: { colours: ['#7b8387', '#6a7478', '#8a8f86'], trim: '#5f676b', finish: 'matt' }, motor: { colours: ['#d6d2c6', '#a3231c', '#1d4a86', '#d19c17', '#202428'], finish: 'gloss' } } },
  plane: { colours: ['#b3b8bc', '#5b6b55', '#27456b', '#b3261e', '#d9b520', '#d8d4c8'], finish: 'satin', wear: .35, trim: '#b3261e',
    by: { jet: { colours: ['#7f878c', '#5d6a72', '#8a8f86'], trim: '#565c62', finish: 'matt' }, biplane: { colours: ['#b3261e', '#d9b520', '#27456b', '#d8d4c8'], trim: '#d8d4c8' }, twin: { trim: '#8d9296' } } },
};

// one shape (slots of geometry) into what a mesh needs: geometry with UVs, its material, aged
function dress(shape, k, seed, age) {
  const out = [];
  for (const [slot, g0] of shape.merged()) {
    const m = new Mesh(boxUV(g0, 1), matOf(slot, k)), a = (AGES[slot] ?? 0) * age;
    if (slot === 'wood') { const uv = g0.attributes.uv.array; for (let i = 0; i < uv.length; i += 2) uv[i] *= .3; }   // (long planks, not bricks of wood)
    if (slot === 'boards' || slot === 'timber') { const uv = g0.attributes.uv.array; for (let i = 0; i < uv.length; i += 2) { uv[i] *= .5; uv[i + 1] *= .735; } }   // (a wagon's: boards 17 cm wide)
    if (a > 0) wear(m, { seed, split: false, edges: (k.finish === 'gloss' && slot === 'paint' ? .15 : .6) * a, dirt: .75 * a, ground: .45 });
    out.push({ slot, geo: m.geometry, mat: m.material, tris: m.geometry.attributes.position.count / 3 });
  }
  return out;
}

const SEATS = ['#2a2b2e', '#45484d', '#8c7c64', '#5a3a28', '#2e3442'];   // (a car's seats: black, grey, beige, brown, navy)
const made = new Map();   // finished vehicles by everything that shapes them: copies share geometry and materials
/**
 * A vehicle: 'car' | 'truck' | 'tank' | 'train' | 'boat' | 'plane'. Options: style (each kind's own: vehicle.kinds), seed (which
 * colour, small differences), colour (its paint), trim (its second colour), finish ('gloss' | 'satin' | 'matt' |
 * 'worn' | 'rusty'), wear (0..1 how aged, or false: new), lit (true: its lamps glow), detail (1; .5 a car's or
 * a lorry's shell and wheels a little coarser). A train: style is its engine ('steam' brings its tender) or one wagon, cars: what
 * it pulls (['van', 'open', 'tanker', 'flat', 'guard', 'coach'...]; one can be { style, load, colour, canvas }: an 'open' wagon's
 * load 'tarp' or 'coal', a 'flat' one's 'crates', and its own colour), gauge (between the rails, 1.435), deflectors (true: a
 * steam engine's smoke deflectors), polished (false: a working engine, its dome and bands painted over and no bright rims),
 * load (a single wagon's), fuse (true: a train that keeps to a straight line, drawn as one mesh a kind of surface).
 */
export function vehicle(kind = 'car', o = {}) {
  if (!MAKERS[kind]) throw new Error(`gs.models.vehicle: no vehicle '${kind}' (try ${Object.keys(MAKERS).join(', ')})`);
  const carOf = c => typeof c === 'string' ? { style: c } : c || {};
  const bad = [o.style, ...(kind === 'train' ? (o.cars || []).map(c => carOf(c).style || '?') : [])].find(x => x && !KINDS[kind].includes(x));
  if (bad) throw new Error(`gs.models.vehicle: no ${kind} called '${bad}' (try ${KINDS[kind].join(', ')})`);
  const seed = o.seed | 0, style = o.style || KINDS[kind][0], age0 = o.wear === false ? 0 : typeof o.wear === 'number' ? o.wear : null, { cars, load, fuse: fused, ...rest } = o, opts = { ...rest, style, seed, ...(load && kind !== 'train' ? { load } : {}) };
  const lookOf = (st, own = {}) => {
    const L = { ...LOOKS[kind], ...LOOKS[kind].by?.[st] }, mine = own.colour ?? own.color, finish = o.finish ?? L.finish;
    const k = { colour: o.colour ?? o.color ?? L.colours[(hash(seed + 1) * L.colours.length) | 0], trim: mine ?? o.trim ?? L.trim ?? '#d9d6cc', finish, lit: !!o.lit, canvas: own.canvas ?? o.canvas, boards: mine };
    if (kind === 'car') { k.seat = o.seat ?? SEATS[(hash(seed + 5) * SEATS.length) | 0]; k.flakes = o.flakes ?? (finish === 'gloss' && hash(seed + 9) < .6 ? .75 : 0); }
    return [k, age0 ?? L.wear];
  };
  if (kind !== 'train') return one(kind, opts, ...lookOf(style));
  // (a wagon can be a name, or { style, load, colour, canvas }: its own planks and tank in its own colour; a wagon by itself takes the train's)
  const wagon = !['steam', 'diesel', 'tender', 'coach'].includes(style);
  const row = [wagon ? { style, load, colour: o.colour ?? o.color } : { style }, ...(style === 'steam' ? [{ style: 'tender' }] : []), ...(cars || []).map(carOf)];
  const train = coupled(row.map(({ style: t, load, colour, color, canvas }) => one(kind, { ...opts, style: t, ...(load ? { load } : {}) }, ...lookOf(t === 'tender' ? 'steam' : t, { colour, color, canvas }))), () => vehicle(kind, o), { kind, ...o, style });
  return fused ? fuse(train, JSON.stringify([o, age0, SLIM.on])) : train;
}
vehicle.kinds = KINDS;
function one(kind, opts, k, age) {
  const key = JSON.stringify([kind, opts, k, age]);
  let v = made.get(key);
  if (!v) {
    pause('Models');   // (while a card loads, a frame may go by before each new vehicle: slices.js)
    const plan = MAKERS[kind](opts), road = kind === 'car' || kind === 'truck';
    const kk = road ? { ...k, inside: !!plan.inside, fit: [plan.size.length, plan.size.height, plan.clear].map(mm).join() } : k;
    v = { plan, k: kk, body: dress(plan.body, kk, opts.seed, age), parts: {} };
    for (const [name, p] of Object.entries(plan.parts || {})) v.parts[name] = dress(p.shape, kk, opts.seed + 7, age);
    if (road) looks(v, kk, opts.seed);
    if (made.size >= 48 && !loading()) made.delete(made.keys().next().value);
    made.set(key, v); built();
  }
  return stand(kind, v, v.k || k, opts);
}
// a car's and a lorry's looks (vehicle-looks.js), once on each of their shared materials: flakes, dirt and beading on the
// paint; see-through glass that breaks, with its wipers' fans on the screen; lamps that can break
function looks(v, k, seed) {
  const { plan } = v, size = [plan.size.length, plan.size.height, plan.clear || .2];
  const sc = plan.screen ? [-.31, plan.screen[0], plan.screen[1], .6] : [0, 0, 0, 0];
  for (const p of v.body) {
    if (looksOf(p.mat).length || p.mat.userData?.pom) continue;
    if (p.slot === 'paint' || p.slot === 'paint2') carPaint(p.mat, { flakes: p.slot === 'paint' ? k.flakes || 0 : 0, size, seed });
    else if (p.slot === 'glass') carGlass(p.mat, { see: k.inside ? .42 : -1, size, screen: sc, seed });
  }
  // its lamps, lit and not (lights() swaps one for the other; a broken lamp starts from the lit one)
  for (const slot of ['lamp', 'tail']) if (v.body.some(p => p.slot === slot)) for (const lit of [false, true]) { const m = matOf(slot, { ...k, lit }); if (!looksOf(m).length) carGlass(m, { see: -1, size, seed }); }
}

const mm = v => Math.round(v * 1000) / 1000;
const meshes = (list, into) => { let t = 0; for (const p of list) { const m = new Mesh(p.geo, p.mat); m.castShadow = m.receiveShadow = true; m.name = p.slot; into.add(m); t += p.tris; } return t; };
// a made vehicle stood up as its own Group: meshes, pivots, points and what it can do
function stand(kind, v, k, opts) {
  const plan = v.plan, root = new Group(), shell = new Group(); root.name = 'vehicle:' + kind; shell.name = 'shell'; root.add(shell);
  let tris = meshes(v.body, shell);
  wheelMat ||= pbr('#ffffff', { rough: .78, vertexColors: true });
  // the parts that turn, each on its own pivot (inside the part it rides on)
  const parts = {};
  for (const [name, p] of Object.entries(plan.parts || {})) { const g = parts[name] = new Group(); g.name = name; g.position.set(...p.at); if (p.order) g.rotation.order = p.order; if (p.rot) g.rotation.set(...p.rot); tris += meshes(v.parts[name], g); }
  for (const [name, p] of Object.entries(plan.parts || {})) (p.on ? parts[p.on] : shell).add(parts[name]);
  const wheel = (w, into) => {
    const piv = new Object3D(), g = wheelOf(w.geo), m = new Mesh(g, wheelMat); piv.rotation.order = 'YXZ'; piv.position.set(...w.at); if (w.rot) piv.rotation.set(...w.rot);
    if (w.at[0] < 0 && !w.rot) m.rotation.y = PI; m.castShadow = m.receiveShadow = true; m.name = 'wheel'; piv.add(m); piv.radius = w.geo.r; piv.width = w.geo.w; piv.steers = !!w.steer; into.add(piv); tris += g.attributes.position.count / 3; return piv;
  };
  const wheels = (plan.wheels || []).map(w => wheel(w, root));
  for (const s of plan.spares || []) wheel(s, shell);
  const points = {};
  for (const [name, p] of Object.entries(plan.points || {})) { const at = Array.isArray(p) ? p : p.at, o = points[name] = new Object3D(); o.name = name; o.position.set(...at); (p.on ? parts[p.on] : shell).add(o); }
  Object.assign(root, { kind, style: plan.style, shell, wheels, parts, points, size: { length: mm(plan.size.length), width: mm(plan.size.width), height: mm(plan.size.height) }, wheelbase: plan.wheelbase || 0, track: plan.track || 0, radius: plan.radius || 0, tris: Math.round(tris), look: { kind, ...opts, ...k } });
  if (plan.length) { root.length = plan.length; root.reach = plan.reach; }
  const tracks = plan.tracks ? laid(root, shell, plan.tracks, k) : null; if (tracks) tris += tracks.tris;
  if (tracks) root.belts = { x: plan.tracks.x, width: plan.tracks.link.w };   // (where its two caterpillar tracks run: gs.outdoors.Marks lays their marks)
  const sets = (plan.sets || []).map(st => { const g = wheelOf(st.geo), im = new InstancedMesh(g, wheelMat, st.at.length); im.castShadow = im.receiveShadow = true; im.instanceMatrix.setUsage(DynamicDrawUsage); im.name = 'wheels'; root.add(im); tris += g.attributes.position.count / 3 * st.at.length; return { im, at: st.at, r: st.geo.r }; });
  const spin = d => {   // railway wheels, and a steam engine's rods on their crank pins
    for (const st of sets) { const a = -d / st.r, c = Math.cos(a), sn = Math.sin(a), E = MX.elements; for (let i = 0; i < st.at.length; i++) { E[0] = 1; E[1] = E[2] = E[3] = E[4] = 0; E[5] = c; E[6] = sn; E[7] = E[8] = 0; E[9] = -sn; E[10] = c; E[11] = E[12] = 0; E[13] = st.at[i][0]; E[14] = st.at[i][1]; E[15] = 1; st.im.setMatrixAt(i, MX); } st.im.instanceMatrix.needsUpdate = true; }
    const q = plan.rods; if (q) { const a = -d / q.r, y = -q.cr * Math.sin(a), z = q.cr * Math.cos(a); parts.rods.position.set(0, q.y + y, z); parts.mainRods.position.set(0, q.y + y, q.z + z); parts.mainRods.rotation.x = Math.asin(clamp(-y / q.l, -1, 1)); }
  };
  if (sets.length) spin(0);
  root.userData.sets = sets;   // (kit use: a fused train takes these over, fuse())
  root.tris = Math.round(tris);   // (with its tracks and railway wheels)
  const props = (plan.props || (parts.prop ? ['prop'] : [])).map(n => parts[n]);   // propellers: blades, and the blur that stands in for them at speed
  for (const p of props) for (const m of p.children) if (m.name === 'blur') { m.visible = false; m.castShadow = false; }
  root.traverse(m => { if (m.name === 'screen' || (m.name === 'glass' && k.inside) || m.name === 'dials') m.castShadow = false; });   // (sun through a see-through cabin's windows)
  for (const key of ['gear', 'sit', 'draft']) if (plan[key] != null) root[key] = plan[key];
  let dist = 0, turn = 0, was = 0, lean = 0, pitch = 0, yaw = 0, lift = 0, rev = 0;
  /** Turns its wheels (and tracks) for a distance travelled so far, in metres (backwards: a smaller number). */
  root.roll = (d, right = d) => { dist = d; for (const w of wheels) w.rotation.x = -d / w.radius; tracks?.roll(d, right); if (sets.length || plan.rods) spin(d); return root; };
  /** Turns its front wheels: radians, + to the right. */
  root.steer = a => { turn = a; for (const w of wheels) if (w.steers) w.rotation.y = -a; return root; };
  /**
   * The easy way to keep it alive each frame: rolls its wheels for its speed (metres a second), eases its front
   * wheels to steer (-1..1, + right; lock: how far they turn at 1, radians), and rocks its body on its springs:
   * outwards in a turn, back as it pulls away, forward as it brakes (sway: how much, 1). A tank: turn (-1..1)
   * runs one track ahead of the other, aim ([bearing, lift]) eases its turret and gun there. power (0..1) spins
   * propellers up to a blur. ground: false keeps wheels still (a plane's, in the air).
   */
  root.move = (dt, speed = 0, { steer = 0, lock = .55, sway = 1, turn: spin = 0, aim = null, power = speed ? 1 : 0, ground = kind !== 'plane' } = {}) => {
    const h = min(1, dt * 8), a = dt > 0 ? (speed - was) / dt : 0; was = speed;
    root.update?.(dt);
    if (tracks) { const dv = clamp(spin, -1, 1) * max(1.2, abs(speed) * .5); tracks.left += (speed + dv) * dt; tracks.right += (speed - dv) * dt; root.roll(tracks.left, tracks.right); } else if (ground) root.roll(dist + speed * dt);
    root.steer(turn + (clamp(steer, -1, 1) * lock - turn) * h);
    if (props.length) { rev += (clamp(power, 0, 1) - rev) * min(1, dt * 1.5); const fast = rev > .45; for (const p of props) { p.rotation.z += rev * 42 * dt; for (const m of p.children) m.visible = (m.name === 'blur') === fast; } }
    if (plan.steer) parts[plan.steer].rotation.y = turn * .7; if (parts.radar) parts.radar.rotation.y += dt * 2.2;
    if (aim && parts.turret) { const q = min(1, dt * 2.5); root.aim(yaw + (aim[0] - yaw) * q, lift + ((aim[1] || 0) - lift) * q); }
    if (plan.wheelbase) {
      lean += (clamp(speed * speed * tan(turn) / plan.wheelbase * .012, -.07, .07) * sway - lean) * h; pitch += (clamp(a * .006, -.035, .035) * sway - pitch) * min(1, dt * 5);
      shell.rotation.z = lean; shell.rotation.x = pitch;
    }
    return root;
  };
  /**
   * For gs.physics3d: the numbers World3D.vehicle wants for this vehicle, with its wheels: world.vehicle(car,
   * car.chassis({ power: 14 })). It moves the body so its origin is where physics wants it (the middle of the
   * chassis, between the axles) and not on the road. o: anything else for World3D.vehicle (stiffness, grip...).
   * A third axle's wheels go with the second's.
   */
  if (plan.wheelbase) root.chassis = (o = {}) => {
    const r = plan.radius, h = o.h ?? .5, rest = o.rest ?? .3, len = rest - 9.81 / (4 * (o.stiffness ?? 30));
    shell.position.set(0, -(h / 2 + len + r), -(plan.mid || 0));
    for (let i = 4; i < wheels.length; i++) { const w = wheels[i], lead = wheels[2 + i % 2], dz = w.position.z - lead.position.z; w.children[0].onBeforeRender = () => { w.rotation.x = lead.rotation.x; w.position.set(w.position.x, lead.position.y, lead.position.z + dz); }; }
    return { w: plan.track + .1, h, l: plan.wheelbase + r * 1.8, radius: r, rest, travel: .25, wheels: wheels.slice(0, 4), ...o };
  };
  /** A tank's turret turned (radians, + to its left, from straight ahead) and its gun lifted (radians up). */
  root.aim = (y = 0, up = 0) => { yaw = y; lift = clamp(up, -.14, .45); if (parts.turret) parts.turret.rotation.y = yaw; if (parts.gun) parts.gun.rotation.x = lift; return root; };
  /** Its lamps on or off (it gets lamps of its own, so its copies keep theirs). */
  root.lights = (on = true) => {
    root.userData.lit = !!on;
    root.traverse(m => { if (m.isMesh && (m.name === 'lamp' || m.name === 'tail' || m.name === 'dials')) { if (m.userData.gsOwn) m.material.emissiveIntensity = on ? m.userData.gsGlow : 0; else m.material = matOf(m.name, { ...k, lit: !!on }); } });
    return root;
  };
  root.userData.lit = !!k.lit;
  // a car's and a lorry's own dirt, rain and damage (vehicle-damage.js)
  if (kind === 'car' || kind === 'truck') wearAndTear(root, shell, { size: plan.size, clear: plan.clear, lampOf: name => matOf(name, { ...k, lit: true }) });
  /** Another one just like it (sharing its shapes and materials). */
  root.twin = () => stand(kind, v, k, opts);
  return root;
}

// a train: its cars in a row, nose to tail, coupled
function coupled(cars, again, look) {
  const root = new Group(), total = cars.reduce((t, c) => t + c.length, 0); root.name = 'vehicle:train'; let z = -total / 2, dist = 0;
  for (const c of cars) { c.back = z + total / 2 + c.length / 2; c.position.z = z + c.length / 2; c.rotation.order = 'YXZ'; z += c.length; root.add(c); }
  Object.assign(root, { kind: 'train', style: cars[0].style, cars, parts: cars[0].parts, points: cars[0].points, wheels: [], size: { length: total, width: Math.max(...cars.map(c => c.size.width)), height: Math.max(...cars.map(c => c.size.height)) }, length: total, radius: cars[0].radius, tris: cars.reduce((t, c) => t + c.tris, 0), look });
  /** Turns every wheel for a distance travelled so far (metres). */
  root.roll = d => { dist = d; for (const c of cars) c.roll(d); return root; };
  /** Each frame: rolls its wheels for its speed (metres a second). */
  root.move = (dt, speed = 0) => root.roll(dist + speed * dt);
  /**
   * Lays the train along a track with its front d metres along it, each car between its own wheels so it bends
   * round curves and tips on slopes. track: (metres along) => { x, y, z } on the rail tops, or a gs.paths.Path;
   * the points are in the train's own space (leave the train itself at the track's origin).
   */
  root.along = (track, d) => {
    const at = typeof track === 'function' ? track : s => track.at(s);
    for (const c of cars) {
      const h = Math.max(1, c.reach), a = at(d - c.back + h), b = at(d - c.back - h), fx = a.x - b.x, fy = (a.y || 0) - (b.y || 0), fz = (a.z || 0) - (b.z || 0), l = Math.hypot(fx, fy, fz) || 1;
      c.position.set((a.x + b.x) / 2, ((a.y || 0) + (b.y || 0)) / 2, ((a.z || 0) + (b.z || 0)) / 2); c.rotation.set(Math.asin(clamp(fy / l, -1, 1)), Math.atan2(-fx, -fz), 0);
    }
    return root;
  };
  root.lights = on => { for (const c of cars) c.lights(on); return root; };
  root.twin = again;
  return root;
}

// A train that keeps to a straight line, drawn in as few draws as it can be (fuse: true): every car's shell joined
// into one mesh for each kind of surface, and every wheelset of one shape drawn as copies in one draw. Surfaces
// that differ only in colour, or by a little in how rough or how much metal they are, share one material and
// keep their colours in their corners; lamps and the fire keep their own (lights() changes them). The cars are
// still there, without meshes, for their points and the parts that turn. A seven-car goods train: 58 draws to 16.
const fusedOf = new Map(), KEEP = ['position', 'normal', 'uv'], OWN = new Set(['lamp', 'tail', 'fire']);
function fuse(root, key) {
  let f = fusedOf.get(key);
  if (!f) {
    const kinds = [], wheels = new Map(); root.updateMatrixWorld(true);
    for (const c of root.cars) {
      for (const m of c.shell.children) {
        if (!m.isMesh || m.isInstancedMesh) continue;
        const mt = m.material, own = OWN.has(m.name) || !!(mt.emissiveIntensity && mt.emissive?.getHex()), see = mt.transparent ? mt.opacity : 1;   // (own: what glows keeps its material)
        let kd = kinds.find(q => own || q.own ? q.mat === mt : q.type === mt.type && q.map === mt.map && q.see === see && q.clear === (mt.clearcoat || 0) && abs(q.rough - mt.roughness) < .101 && abs(q.metal - mt.metalness) < .151);
        if (!kd) kinds.push(kd = { name: m.name, own, cast: m.castShadow, mat: mt, type: mt.type, map: mt.map, see, clear: mt.clearcoat || 0, rough: mt.roughness, metal: mt.metalness, geos: [] });
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
        for (const a of Object.keys(g.attributes)) if (!KEEP.includes(a) && (own || a !== 'color')) g.deleteAttribute(a);
        if (!own) {   // its colour into its corners (times what wear() put there)
          const n = g.attributes.position.count, old = g.attributes.color, col = new Float32Array(n * 3), { r, g: gr, b } = mt.color;
          for (let i = 0; i < n; i++) { col[i * 3] = r * (old ? old.getX(i) : 1); col[i * 3 + 1] = gr * (old ? old.getY(i) : 1); col[i * 3 + 2] = b * (old ? old.getZ(i) : 1); }
          g.setAttribute('color', new BufferAttribute(col, 3));
        }
        kd.geos.push(g);
      }
      for (const st of c.userData.sets) { let w = wheels.get(st.im.geometry); if (!w) wheels.set(st.im.geometry, w = { geo: st.im.geometry, r: st.r, at: [] }); for (const [y, z] of st.at) w.at.push([y, z + c.position.z]); }
    }
    f = { shell: kinds.map(kd => {
      const geo = kd.geos.length === 1 ? kd.geos[0] : mergeGeometries(kd.geos, false); if (kd.geos.length > 1) for (const g of kd.geos) g.dispose();
      slim(geo, { normal: 16, uv: true, force: true });   // (a whole train in a few meshes: its normals, colours and small UVs in fewer bytes, slim.js; 16 bits a normal, for paint that shines)
      let mat = kd.mat; if (!kd.own) { mat = kd.mat.clone(); mat.color.setRGB(1, 1, 1); mat.vertexColors = true; }
      return { name: kd.name, cast: kd.cast, geo, mat };
    }), wheels: [...wheels.values()] };
    if (fusedOf.size >= 8 && !loading()) fusedOf.delete(fusedOf.keys().next().value);
    fusedOf.set(key, f);
  }
  // the cars give up their own meshes and wheels (their points, and an engine's rods, stay with them)
  for (const c of root.cars) {
    for (const m of [...c.shell.children]) if (m.isMesh && !m.isInstancedMesh) c.shell.remove(m);
    for (const st of c.userData.sets) { c.remove(st.im); st.im.dispose(); } c.userData.sets.length = 0;
  }
  const shell = new Group(); shell.name = 'shell'; root.add(shell);
  for (const p of f.shell) { const m = new Mesh(p.geo, p.mat); m.name = p.name; m.castShadow = p.cast; m.receiveShadow = true; shell.add(m); }
  const sets = f.wheels.map(w => { const im = new InstancedMesh(w.geo, wheelMat, w.at.length); im.castShadow = im.receiveShadow = true; im.instanceMatrix.setUsage(DynamicDrawUsage); im.name = 'wheels'; root.add(im); return { im, at: w.at, r: w.r }; });
  const each = root.roll, E = MX.elements;
  root.roll = d => {
    each(d);   // (an engine's rods)
    for (const st of sets) { const a = -d / st.r, c = Math.cos(a), sn = Math.sin(a); for (let i = 0; i < st.at.length; i++) { E[0] = 1; E[1] = E[2] = E[3] = E[4] = 0; E[5] = c; E[6] = sn; E[7] = E[8] = 0; E[9] = -sn; E[10] = c; E[11] = E[12] = 0; E[13] = st.at[i][0]; E[14] = st.at[i][1]; E[15] = 1; st.im.setMatrixAt(i, MX); } st.im.instanceMatrix.needsUpdate = true; }
    return root;
  };
  root.roll(0);
  root.along = () => { throw new Error('gs.models.vehicle: a train made with fuse: true keeps to a straight line (its cars are one shape); leave fuse out to lay it along(track)'); };
  root.lights = (on = true) => { for (const m of shell.children) if (m.name === 'lamp' || m.name === 'tail') m.material = matOf(m.name, { lit: !!on }); return root; };
  root.shell = shell; root.fused = true;
  return root;
}

// a tank's tracks: every link a copy laid along the loop, every wheel a copy turned, both sides in two draws
const MX = new Matrix4(), AT = { z: 0, y: 0, dz: 0, dy: 0 };
function laid(root, shell, t, k) {
  const n = Math.round(t.run.length / t.pitch), pitch = t.run.length / n, { w, t: th } = t.link;
  const lg = mergeGeometries([new BoxGeometry(w, th, pitch * .84), new BoxGeometry(w * .94, th * .7, pitch * .26).translate(0, th * .6, 0), new BoxGeometry(w * .12, th * 1.5, pitch * .4).translate(0, -th * 1.1, 0)], false);
  const links = new InstancedMesh(lg, matOf('iron', k), n * 2), wg = wheelOf({ ...t.wheel, hub: k.colour }), m = t.wheels.length, turn = new InstancedMesh(wg, wheelMat, m * 2);
  for (const im of [links, turn]) { im.castShadow = im.receiveShadow = true; im.instanceMatrix.setUsage(DynamicDrawUsage); im.frustumCulled = false; shell.add(im); }
  links.name = 'tracks'; turn.name = 'wheels';
  const E = MX.elements, out = {
    left: 0, right: 0, tris: (lg.attributes.position.count / 3 * n + wg.attributes.position.count / 3 * m) * 2,
    roll(dl, dr) {
      out.left = dl; out.right = dr;
      for (let s = 0; s < 2; s++) {
        const d = s ? dr : dl, x = (s ? 1 : -1) * t.x;
        for (let i = 0; i < n; i++) {   // (a link's own x across, y out from the loop, z back along it)
          const p = t.run.at(i * pitch + d, AT);
          E[0] = 1; E[1] = 0; E[2] = 0; E[4] = 0; E[5] = -p.dz; E[6] = p.dy; E[8] = 0; E[9] = -p.dy; E[10] = -p.dz; E[12] = x; E[13] = p.y; E[14] = p.z + t.at; E[3] = E[7] = E[11] = 0; E[15] = 1;
          links.setMatrixAt(s * n + i, MX);
        }
        for (let i = 0; i < m; i++) {
          const q = t.wheels[i], a = -d / q.r, c = Math.cos(a), sn = Math.sin(a), f = q.r / t.wheel.r, sx = s ? 1 : -1;   // (the left ones face the other way)
          E[0] = sx; E[1] = 0; E[2] = 0; E[4] = 0; E[5] = c * f; E[6] = sn * f; E[8] = 0; E[9] = -sn * f * sx; E[10] = c * f * sx; E[12] = x; E[13] = q.y; E[14] = q.z; E[3] = E[7] = E[11] = 0; E[15] = 1;
          turn.setMatrixAt(s * m + i, MX);
        }
      }
      links.instanceMatrix.needsUpdate = turn.instanceMatrix.needsUpdate = true;
    },
  };
  out.roll(0, 0);
  return out;
}
