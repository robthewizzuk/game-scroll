// gs.sound.Foley: the sounds a world makes by itself. Things that knock into each other sound of what they are
// made of, feet sound of what they walk on, and engines rev with their speed through the gears, with nothing
// more to call than update() each frame. All made in code, like every other sound in the kit (no sound files).
//
//   const { Ears, Foley } = gs.sound;
//   ears = new Ears({ level: world });                     // (optional: without ears the sounds are not placed)
//   foley = new Foley({ ears, world, marks, weather });    // in make(); world: a gs.physics3d World3D, whose knocks then sound by themselves
//   foley.watch(person);                                   // a gs.models.human: a footstep where each foot comes down, by what is under it
//   foley.watch(truck);                                    // a gs.models.vehicle: its engine through the gears with its speed, its tyres on the ground, skids
//   foley.watch(buggy);                                    // a World3D.vehicle(), or a gs.vehicles Car or Kart: the same, from its own speed and throttle
//   foley.watch(dog, { feet: 4, shoe: 'paw', weight: 30 });   // anything else that moves: steps paced out along its way
//   update(dt) { ...; foley.update(dt); }
//   phys.box(crateMesh, 1, 1, 1, { sound: 'wood' });       // what a body is made of (else it is read from its mesh)
//   foley.hit(p, 'metal', { speed: 6, size: .3 });  foley.step(p, 'gravel');  foley.surface(p)   // by hand
//
// What things are made of: 'wood', 'metal', 'stone', 'glass', 'plastic', 'rubber', 'cloth', 'body', 'dirt', 'grass',
// 'gravel', 'sand', 'snow', 'mud', 'water', 'ice', 'leaves', 'carpet'. A mesh says so with userData.sound, or by its
// material: gs.models materials and props are known by their recipes (planks: wood, rust: metal, brick: stone...),
// other materials by their names and how metallic they are.
// What is underfoot, the first that answers: the game's ground(x, z, y) (a material, or nothing), the weather's
// settled snow, the marks' snow, mud, sand and grass, the body below in the world (its sound, or its mesh), then
// dirt on a gs.outdoors land, else stone. Puddles from the weather splash as well.
// Every sound goes through the voice cap (sound.js), so a hundred crates falling at once stay a few dozen knocks,
// the nearest first.
import { tone, noise, kitBus } from './sound.js';
import { audio, sound } from '../sfx.js';
import { register } from './cleanup.js';
import { timed } from './prof.js';
import { muffleOf } from './acoustics.js';

const MATERIALS = ['wood', 'metal', 'stone', 'glass', 'plastic', 'rubber', 'cloth', 'body', 'dirt', 'grass', 'gravel', 'sand', 'snow', 'mud', 'water', 'ice', 'leaves', 'carpet'];
const SOFT = new Set(['cloth', 'body', 'dirt', 'grass', 'sand', 'snow', 'mud', 'water', 'leaves', 'carpet', 'rubber']);
const HARD = new Set(['stone', 'wood', 'metal', 'ice', 'glass', 'plastic']);
const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const XYZ = (p, o = {}) => { o.x = p.x || 0; o.y = p.y || 0; o.z = p.z == null ? 0 : p.z; return o; };

/* ---------- what a knock sounds like, by what was hit ---------- */
// o.t / o.n: a tone and a noise burst at the point (each a little different from the last). k: pitch (a bigger
// thing is lower), v: 0..1 how hard, s: its size in metres, short: it hit something soft (a ring is cut short).
const KNOCK = {
  wood(o, k, v, s) { o.t(190 * k, { len: .08 + .06 * Math.min(1, s), wave: 'triangle', vol: .09 * v, slide: -40 * k }); o.t(520 * k, { len: .05, wave: 'sine', vol: .035 * v }); o.n(.05, { vol: .07 * v, from: 1600 * k, to: 500, filter: 'bandpass', q: 1.2 }); },
  metal(o, k, v, s, short) { const L = short ? .12 : .6 + .6 * Math.min(1.5, s); for (const [m, a, l] of [[1, .05, 1], [2.76, .03, .7], [5.4, .02, .45], [8.93, .012, .3]]) o.t(560 * k * m * rnd(.99, 1.01), { len: L * l, wave: 'sine', vol: a * v }); o.n(.025, { vol: .07 * v, from: 9000, to: 5000, filter: 'highpass' }); },
  stone(o, k, v) { o.n(.1, { vol: .1 * v, from: 2600 * k, to: 300, q: .7 }); o.t(85 * k, { len: .09, wave: 'sine', vol: .08 * v, slide: -30 }); },
  glass(o, k, v, s, short) { const L = short ? .07 : .2 + .1 * Math.min(1, s); for (const [m, a] of [[1, .032], [2.32, .022], [3.87, .016], [6.1, .009]]) o.t(1700 * k * m * rnd(.985, 1.015), { len: L, wave: 'sine', vol: a * v }); o.n(.02, { vol: .05 * v, from: 9000, to: 7000, filter: 'highpass' }); },
  plastic(o, k, v) { o.t(380 * k, { len: .05, wave: 'triangle', vol: .06 * v, slide: -80 }); o.n(.035, { vol: .06 * v, from: 2200 * k, to: 1200, filter: 'bandpass', q: 1.5 }); },
  rubber(o, k, v) { o.t(120 * k, { len: .1, wave: 'sine', vol: .1 * v, slide: 70 * k }); o.n(.03, { vol: .03 * v, from: 600, to: 200 }); },
  cloth(o, k, v) { o.n(.08, { vol: .12 * v, from: 700, to: 200 }); o.t(90 * k, { len: .06, wave: 'sine', vol: .04 * v }); },
  body(o, k, v) { o.t(75 * k, { len: .12, wave: 'sine', vol: .12 * v, slide: -25 }); o.n(.07, { vol: .06 * v, from: 600, to: 150 }); },
  dirt(o, k, v) { o.n(.13, { vol: .09 * v, from: 900, to: 120 }); o.t(65 * k, { len: .1, wave: 'sine', vol: .08 * v, slide: -20 }); },
  ice(o, k, v, s, short) { KNOCK.stone(o, k * 1.2, v * .8); KNOCK.glass(o, k * .7, v * .4, s, short); },
};
// the ground's own: a knock on it sounds like a heavy step
for (const m of ['grass', 'gravel', 'sand', 'snow', 'mud', 'water', 'leaves', 'carpet']) KNOCK[m] = (o, k, v) => STEP[m](o, v * 1.6, k);

/* ---------- what a step sounds like, by what is underfoot ---------- */
// w: how heavy (1: a grown person walking), k: pitch
const STEP = {
  stone(o, w, k) { o.n(.045, { vol: .05 * w, from: 2400 * k, to: 500 }); o.t(105 * k, { len: .035, wave: 'sine', vol: .035 * w, slide: -35 }); },
  wood(o, w, k) { o.t(130 * k, { len: .07, wave: 'triangle', vol: .05 * w, slide: -25 }); o.n(.05, { vol: .04 * w, from: 1100 * k, to: 500, filter: 'bandpass', q: 1.4 }); if (Math.random() < .2) o.t(rnd(420, 700), { len: .1, wave: 'sine', vol: .006 * w, slide: rnd(-60, 60), at: .03 }); },   // (now and then a board creaks)
  metal(o, w, k) { o.t(420 * k, { len: .14, wave: 'sine', vol: .022 * w }); o.t(1180 * k, { len: .09, wave: 'sine', vol: .014 * w }); o.n(.03, { vol: .045 * w, from: 5000, to: 2500, filter: 'highpass' }); },
  glass(o, w, k) { STEP.stone(o, w, k * 1.1); o.t(2600 * k, { len: .05, wave: 'sine', vol: .01 * w }); },
  plastic(o, w, k) { o.t(260 * k, { len: .04, wave: 'triangle', vol: .04 * w }); o.n(.04, { vol: .035 * w, from: 1800 * k, to: 900, filter: 'bandpass', q: 1.2 }); },
  rubber(o, w, k) { o.t(110 * k, { len: .05, wave: 'sine', vol: .04 * w }); o.n(.04, { vol: .02 * w, from: 600, to: 200 }); },
  dirt(o, w, k) { o.n(.07, { vol: .05 * w, from: 1000 * k, to: 200 }); o.t(80 * k, { len: .04, wave: 'sine', vol: .03 * w }); },
  grass(o, w) { o.n(.12, { vol: .035 * w, from: 4200, to: 2400, filter: 'bandpass', q: .8, attack: .02 }); o.n(.05, { vol: .025 * w, from: 700, to: 200 }); },
  gravel(o, w) { for (let i = 0; i < 5; i++) o.n(.012, { vol: rnd(.025, .05) * w, from: rnd(2500, 5000), to: 1800, filter: 'bandpass', q: 1.2, at: rnd(0, .07) }); o.n(.05, { vol: .03 * w, from: 800, to: 200 }); },
  sand(o, w) { o.n(.1, { vol: .035 * w, from: 3000, to: 1500, filter: 'bandpass', q: .7, attack: .015 }); o.n(.05, { vol: .02 * w, from: 500, to: 150 }); },
  snow(o, w) { for (let i = 0; i < 7; i++) o.n(.016, { vol: rnd(.03, .055) * w, from: rnd(1400, 3200), to: 1000, filter: 'bandpass', q: 1.6, at: .01 + i * rnd(.012, .02) }); o.n(.06, { vol: .035 * w, from: 500, to: 150 }); },
  mud(o, w) { o.n(.09, { vol: .05 * w, from: 600, to: 150, q: 2 }); o.t(rnd(160, 220), { len: .08, wave: 'sine', vol: .025 * w, slide: -90, at: .03 }); },
  water(o, w) { o.n(.16, { vol: .05 * w, from: 2600, to: 600, filter: 'bandpass', q: .6 }); for (let i = 0; i < 2; i++) o.t(rnd(350, 600), { len: .05, wave: 'sine', vol: .015 * w, slide: rnd(300, 700), at: rnd(.03, .12) }); },
  ice(o, w, k) { STEP.stone(o, w * .8, k * 1.2); o.t(rnd(2500, 3500), { len: .03, wave: 'sine', vol: .008 * w }); },
  leaves(o, w) { for (let i = 0; i < 6; i++) o.n(.01, { vol: rnd(.015, .03) * w, from: rnd(3000, 7000), to: 2500, filter: 'highpass', at: rnd(0, .1) }); o.n(.04, { vol: .015 * w, from: 600, to: 200 }); },
  carpet(o, w, k) { o.n(.06, { vol: .06 * w, from: 600, to: 150 }); o.t(85 * k, { len: .04, wave: 'sine', vol: .025 * w }); },
};
STEP.cloth = STEP.body = STEP.carpet;
// how each kind of foot changes a step: a boot's heel clicks on hard floors, bare feet and paws are soft, a hoof clops
const SHOES = {
  boot(o, m, w, k) { STEP[m](o, w, k); if (HARD.has(m)) o.n(.012, { vol: .02 * w, from: 7000, to: 5000, filter: 'highpass' }); },
  bare(o, m, w, k) { if (HARD.has(m)) o.n(.03, { vol: .025 * w, from: 1500 * k, to: 400 }); else STEP[m](o, w * .5, k); },
  paw(o, m, w, k) { if (HARD.has(m)) { o.n(.02, { vol: .012 * w, from: 2500, to: 1200 }); if (Math.random() < .5) o.n(.008, { vol: .01 * w, from: 6000, to: 4000, filter: 'highpass', at: .02 }); } else STEP[m](o, w * .35, k); },   // (claws on a hard floor)
  hoof(o, m, w, k) { if (HARD.has(m)) { o.t(680 * k, { len: .04, wave: 'triangle', vol: .06 * w }); o.t(380 * k, { len: .05, wave: 'sine', vol: .05 * w, at: .012 }); o.n(.02, { vol: .04 * w, from: 4000, to: 2000, filter: 'bandpass' }); } else STEP[m](o, w * 1.4, k * .8); },
};

/* ---------- what a mesh is made of ---------- */
const WORDS = [
  [/wood|plank|bark|crate|barrel|pallet|board|log|timber|door|table|chair|fence|shelf|chest|bench/, 'wood'],
  [/rust|metal|steel|iron|chrome|tin|alu|copper|brass|pipe|bin|bucket|car|truck|tank|grate|rail/, 'metal'],
  [/brick|stone|cobble|tile|concrete|marble|rock|plaster|granite|slate|pave|asphalt|road|wall/, 'stone'],
  [/glass|window|bottle|crystal/, 'glass'], [/ice/, 'ice'], [/fabric|cloth|leather|sack|cushion|bed|sofa|curtain|rug/, 'cloth'],
  [/carpet/, 'carpet'], [/plastic|cone|toy/, 'plastic'], [/rubber|tyre|tire|ball/, 'rubber'], [/skin|flesh|body|human|person/, 'body'],
  [/dirt|soil|earth|ground|terrain|land/, 'dirt'], [/grass|lawn|meadow/, 'grass'], [/gravel|shingle/, 'gravel'], [/sand|beach/, 'sand'],
  [/snow/, 'snow'], [/mud/, 'mud'], [/water|sea|lake|river|pool/, 'water'], [/leaf|leaves/, 'leaves'],
];
const RECIPE = { wood: 'wood', planks: 'wood', bark: 'wood', brick: 'stone', stone: 'stone', cobbles: 'stone', tiles: 'stone', concrete: 'stone', marble: 'stone', metal: 'metal', rust: 'metal', fabric: 'cloth', leather: 'cloth', dirt: 'dirt', sand: 'sand', snow: 'snow', skin: 'body' };
const known = m => (m && KNOCK[m] ? m : null);
function ofMaterial(mt) {
  if (!mt) return null;
  if (Array.isArray(mt)) { for (const x of mt) { const r = ofMaterial(x); if (r) return r; } return null; }
  const s = known(mt.userData?.sound); if (s) return s;
  const r = mt.userData?.recipe?.name; if (r && RECIPE[r]) return RECIPE[r];
  const name = String(mt.name || '').toLowerCase().replace(/^models:/, '');
  if (r === 'paint' || name === 'paint') return (mt.metalness ?? 0) > .3 ? 'metal' : 'wood';   // (painted: what is under it)
  for (const [re, m] of WORDS) if (re.test(name)) return m;
  if ((mt.metalness ?? 0) > .6) return 'metal';
  if ((mt.transmission ?? 0) > .5 || (mt.transparent && (mt.opacity ?? 1) < .5 && (mt.roughness ?? 1) < .2)) return 'glass';
  return null;
}
// What a mesh (or a group of them) is made of, for its sounds: userData.sound, else its material's recipe or name; null if it does not say.
function materialOf(obj) {
  if (!obj) return null;
  const own = known(obj.userData?.sound); if (own) return own;
  if (obj.userData?.prop) { const p = String(obj.userData.prop); for (const [re, m] of WORDS) if (re.test(p)) return m; }
  if (obj.isMesh) return ofMaterial(obj.material) || (obj.name ? WORDS.find(([re]) => re.test(obj.name.toLowerCase()))?.[1] : null) || null;
  // a group: the biggest mesh in it that says (a barrel is its staves, not its hoops)
  let best = null, most = -1;
  obj.traverse?.(m => { if (!m.isMesh || m === obj) return; const n = m.geometry?.attributes?.position?.count || 0, s = known(m.userData?.sound) || ofMaterial(m.material); if (s && n > most) { most = n; best = s; } });
  return best || (obj.name ? WORDS.find(([re]) => re.test(obj.name.toLowerCase()))?.[1] : null) || null;
}

/* ---------- engines ---------- */
// cyl: cylinders (how many firings a turn of the engine: cyl / 2), idle and red: revs a minute, gears, top: metres a second
// at the top of the last gear, bright: how much of its buzz comes through, knock: a diesel's clatter, wave: the
// motor's sound, vol: how loud it is, and what else goes with it: water, air, tracks, rail, chuff (steam), jet, prop
const ENGINES = {
  petrol: { cyl: 4, idle: 850, red: 6500, gears: 5, top: 45, bright: 1, knock: 0, vol: .05 },
  sports: { cyl: 6, idle: 1000, red: 8200, gears: 6, top: 75, bright: 1.4, knock: 0, vol: .06 },
  van: { cyl: 4, idle: 800, red: 5000, gears: 5, top: 36, bright: .8, knock: .1, vol: .05 },
  jeep: { cyl: 6, idle: 700, red: 5200, gears: 5, top: 40, bright: .7, knock: .1, vol: .055 },
  kart: { cyl: 1, idle: 1800, red: 9000, gears: 1, top: 22, bright: 1.3, knock: 0, vol: .045, wave: 'square' },
  diesel: { cyl: 6, idle: 600, red: 2400, gears: 10, top: 28, bright: .5, knock: .6, vol: .06 },
  tank: { cyl: 12, idle: 650, red: 2600, gears: 6, top: 16, bright: .45, knock: .7, vol: .07, tracks: 1 },
  'rail diesel': { cyl: 16, idle: 400, red: 1000, gears: 8, top: 35, bright: .4, knock: .5, vol: .07, rail: 1 },
  steam: { chuff: 1, top: 30, vol: .07, rail: 1 },
  rail: { none: 1, top: 35, vol: .05, rail: 1 },
  outboard: { cyl: 2, idle: 1100, red: 6000, gears: 1, top: 18, bright: 1.1, knock: 0, vol: .05, wave: 'square', water: 1 },
  'boat diesel': { cyl: 6, idle: 550, red: 2200, gears: 1, top: 14, bright: .45, knock: .5, vol: .06, water: 1 },
  rowboat: { none: 1, top: 4, vol: .04, water: 1 },
  prop: { prop: 3, idle: 700, red: 2700, gears: 1, top: 70, bright: .9, knock: 0, vol: .07, air: 1 },
  jet: { jet: 1, top: 120, vol: .08, air: 1 },
  electric: { whine: 1, top: 40, vol: .04 },
};
// which engine a gs.models.vehicle has, by its kind and style
function engineOf(v, o) {
  if (o.engine && ENGINES[o.engine]) return o.engine;
  const k = v.kind, s = v.style;
  if (k === 'car') return s === 'sports' ? 'sports' : s === 'van' || s === 'pickup' ? 'van' : s === 'jeep' ? 'jeep' : 'petrol';
  if (k === 'truck') return 'diesel';
  if (k === 'tank') return 'tank';
  if (k === 'train') return s === 'steam' ? 'steam' : s === 'diesel' ? 'rail diesel' : 'rail';
  if (k === 'boat') return s === 'rowboat' ? 'rowboat' : s === 'motor' ? 'outboard' : 'boat diesel';
  if (k === 'plane') return s === 'jet' ? 'jet' : 'prop';
  return 'petrol';
}
let noiseBuf = null;
function noiseOf(ctx) {
  if (noiseBuf?.sampleRate === ctx.sampleRate) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
let curve = null;
const softClip = () => { if (curve) return curve; curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); } return curve; };
// how the ground under the wheels sounds: [filter, Hz, q, loudness]
const ROAD = { stone: ['lowpass', 380, .7, .7], dirt: ['lowpass', 700, .7, .8], grass: ['bandpass', 1200, .5, .6], gravel: ['bandpass', 2400, .8, 1.2], sand: ['bandpass', 1800, .5, .8], snow: ['bandpass', 1500, .9, .8], mud: ['lowpass', 500, 2, 1], water: ['bandpass', 800, .6, 1.2], ice: ['lowpass', 300, .7, .4], wood: ['lowpass', 500, 1.2, .8], metal: ['bandpass', 900, 2, .8] };

class Engine {
  constructor(f, thing, o) {
    this.f = f; this.thing = thing; this.o = o; this.by = thing.ctl && thing.chassis ? 'physics' : 'pace' in thing && 'drifting' in thing ? 'arcade' : 'model';
    const v = this.by === 'physics' ? thing.mesh : thing;
    this.name = this.by === 'arcade' ? (o.engine || ('heading' in thing ? 'kart' : 'petrol')) : engineOf(v || {}, o);
    this.spec = { ...ENGINES[this.name], ...(o.top ? { top: o.top } : {}) };
    this.n = null; this.speed = 0; this.acc = 0; this.load = .2; this.rpm = this.spec.idle || 0; this.gear = 0; this.shift = 0; this.slip = 0; this.chuff = 0; this.rail = 0; this.spool = 0; this.was = null; this.surfT = 0; this.road = 'stone';
  }
  // where it is, which way its nose points (x, z), its speed along that way and across it
  read(dt) {
    const t = this.thing, P = this.p ||= { x: 0, y: 0, z: 0 };
    let fx = 0, fz = -1, obj = null;
    if (this.by === 'physics') { XYZ(t.chassis.pos, P); obj = t.mesh; }
    else if (this.by === 'arcade') {
      if ('heading' in t) { P.x = t.x; P.y = t.y; P.z = t.z; fx = -Math.sin(t.heading); fz = -Math.cos(t.heading); } else { P.x = t.x; P.y = t.y; P.z = undefined; fx = Math.cos(t.angle); fz = Math.sin(t.angle); }
    } else { obj = t; t.updateWorldMatrix?.(true, false); const e = t.matrixWorld.elements; P.x = e[12]; P.y = e[13]; P.z = e[14]; }
    if (obj?.matrixWorld) { const e = obj.matrixWorld.elements, l = Math.hypot(e[8], e[10]) || 1; fx = -e[8] / l; fz = -e[10] / l; }
    const flat = P.z === undefined, px = P.x, pz = flat ? P.y : P.z, w = this.was;
    let vx = 0, vz = 0;
    if (w && dt > 0) { const jx = (px - w.x) / dt, jz = (pz - w.z) / dt; if (Math.hypot(jx, jz) < 400) { vx = jx; vz = jz; } }
    this.was = { x: px, z: pz };
    const along = vx * fx + vz * fz, across = Math.abs(vx * fz - vz * fx), k = 1 - Math.exp(-dt * 10);
    let sp = this.by === 'physics' ? t.speed : this.by === 'arcade' ? t.speed : along;
    if (this.by === 'arcade') sp = t.pace * this.spec.top * Math.sign(t.speed || 1);   // (its own units: as a share of its top speed)
    const before = this.speed; this.speed += (sp - this.speed) * k;
    this.acc += ((dt > 0 ? (this.speed - before) / dt : 0) - this.acc) * k;
    this.slip += ((this.by === 'arcade' ? (t.drifting ? 5 : 0) : across) - this.slip) * k;
  }
  // how hard the engine works, 0..1
  throttle() {
    const t = this.thing, o = this.o;
    if (o.throttle) return clamp(+o.throttle() || 0, 0, 1);
    if (this.by === 'physics') return t.braking ? .05 : clamp(Math.abs(t.throttle || 0), 0, 1);
    const top = this.spec.top, a = this.acc;
    if (Math.abs(this.speed) < .3 && Math.abs(a) < .3) return .08;
    return clamp(.3 + a / (top * .12), .05, 1);
  }
  build() {
    const a = audio(); if (!a || sound.muted || !sound.volume) return false;
    const ctx = a.ctx, S = this.spec, f = this.f, E = f.ears;
    const pos = this.p || XYZ(this.thing.position || this.thing);
    const out = E ? E.node(pos, { track: true }) : kitBus('sfx'); if (!out) return false;
    const n = this.n = { ctx, out, all: [], srcs: [] }, add = x => (n.all.push(x), x), src = x => (n.srcs.push(x), add(x));
    const gain = v => { const g = add(ctx.createGain()); g.gain.value = v; return g; }, filt = (type, hz, q) => { const b = add(ctx.createBiquadFilter()); b.type = type; b.frequency.value = hz; b.Q.value = q; return b; };
    const osc = (type, hz) => { const x = src(ctx.createOscillator()); x.type = type; x.frequency.value = hz; return x; }, hiss = () => { const x = src(ctx.createBufferSource()); x.buffer = noiseOf(ctx); x.loop = true; return x; };
    n.master = gain(0); n.master.connect(out);
    if (!S.none && !S.chuff && !S.jet && !S.whine) {   // the motor: two saws a hair apart and a note an octave below, roughed up and filtered
      n.o1 = osc(S.wave || 'sawtooth', 50); n.o2 = osc(S.wave || 'sawtooth', 50); n.o3 = osc('square', 25);
      const mix = gain(.33), sh = add(ctx.createWaveShaper()); sh.curve = softClip(); n.lp = filt('lowpass', 800, .8); n.mg = gain(0);
      n.o1.connect(mix); n.o2.connect(mix); n.o3.connect(mix); mix.connect(sh); sh.connect(n.lp); n.lp.connect(n.mg); n.mg.connect(n.master);
    }
    // a pulsing hiss: a diesel's knock, a propeller's beat, a tank's tracks (noise through a band, its loudness
    // swung by a square wave)
    const pulsed = (hz, q) => { const s = hiss(), bp = filt('bandpass', hz, q), am = gain(.5), lfo = osc('square', 20), dep = gain(.5), g = gain(0); s.connect(bp); bp.connect(am); lfo.connect(dep); dep.connect(am.gain); am.connect(g); g.connect(n.master); return { bp, lfo, g }; };
    if (S.knock || S.prop) n.knock = pulsed(1800, .9);
    if (S.tracks) n.tracks = pulsed(2600, 1.4);
    { const s = hiss(); n.rf = filt('lowpass', 500, .7); n.rg = gain(0); s.connect(n.rf); n.rf.connect(n.rg); n.rg.connect(n.master); }   // tyres on the ground, water under a hull, air past a wing
    if (!S.water && !S.air && !S.chuff && !S.none) { n.sq = osc('sine', 950); const w = osc('sine', 7), wd = gain(60); w.connect(wd); wd.connect(n.sq.frequency); n.sg = gain(0); n.sq.connect(n.sg); n.sg.connect(n.master); }   // a skid
    if (S.jet || S.whine) { n.wh = osc('sine', 1500); n.wg = gain(0); n.wh.connect(n.wg); n.wg.connect(n.master); }
    if (S.jet || S.chuff) { const s = hiss(); n.jf = filt(S.jet ? 'lowpass' : 'highpass', S.jet ? 600 : 3000, .6); n.jg = gain(0); s.connect(n.jf); n.jf.connect(n.jg); n.jg.connect(n.master); }   // a jet's roar, or a steam engine's hiss at rest
    const t = ctx.currentTime; for (const x of n.srcs) x.start(t, x.buffer ? Math.random() : 0);
    n.master.gain.setTargetAtTime(S.vol * (this.o.vol ?? 1), t, .15);
    if (E?.cast) { const self = this; this.hearer = { node: out, hear() { const mf = out.gsMuffle; if (!mf || !self.p) return; const k = E.blocked(self.p); if (Math.abs(k - mf.k) < .02) return; mf.k = k; const m = muffleOf(k), tt = ctx.currentTime; mf.f.frequency.setTargetAtTime(m.hz, tt, .07); mf.g.gain.setTargetAtTime(m.gain, tt, .07); } }; E.live.push(this.hearer); }
    return true;
  }
  update(dt) {
    this.read(dt);
    if (!this.n && !this.build()) return;
    const n = this.n, S = this.spec, ctx = n.ctx, t = ctx.currentTime, set = (prm, v, tc = .04) => prm.setTargetAtTime(v, t, tc);
    const p = this.p, speed = Math.abs(this.speed), frac = speed / S.top, load0 = this.throttle();
    if (this.f.ears && p) { const q = p.z === undefined ? { x: p.x, y: 0, z: p.y } : p; if (n.out.positionX) { set(n.out.positionX, q.x, .03); set(n.out.positionY, q.y, .03); set(n.out.positionZ, q.z, .03); } else n.out.setPosition(q.x, q.y, q.z); }
    // through the gears: each gear tops out at a share of the top speed; up near the red line, down when it labours
    if (S.gears) {
      const G = S.gears, top = i => ((i + 1) / G) ** .75;
      if (this.gear < G - 1 && frac > top(this.gear) * .97) { this.gear++; this.shift = .18; }
      else if (this.gear > 0 && frac < top(this.gear - 1) * .6) this.gear--;
      const r = clamp(frac / top(this.gear), 0, 1.05), want = S.idle + (S.red - S.idle) * Math.max(r ** .9, this.gear === 0 ? .35 * load0 : 0);   // (first gear from rest: the clutch lets it rev)
      this.rpm += (want - this.rpm) * (1 - Math.exp(-dt * (this.shift > 0 ? 14 : 7)));
    }
    if (this.shift > 0) this.shift -= dt;
    this.load += ((this.shift > 0 ? .1 : load0) - this.load) * (1 - Math.exp(-dt * 6));
    const L = this.load, R = S.red ? this.rpm / S.red : 0;
    if (n.o1) {
      const hz = S.prop ? this.rpm / 60 * S.prop : this.rpm / 60 * S.cyl / 2;
      set(n.o1.frequency, hz); set(n.o2.frequency, hz * 1.006); set(n.o3.frequency, hz / 2);
      set(n.lp.frequency, 220 + S.bright * (350 + 2600 * L) * (.35 + .65 * R)); set(n.mg.gain, (.35 + .65 * L) * (.55 + .45 * R));
    }
    if (n.knock) { const hz = S.prop ? this.rpm / 60 : this.rpm / 60 * S.cyl / 2; set(n.knock.lfo.frequency, Math.min(90, hz)); set(n.knock.bp.frequency, S.prop ? 500 : 1400 + 900 * R); set(n.knock.g.gain, (S.knock || .5) * (.3 + .7 * L) * (S.prop ? .8 : .6)); }
    if (n.tracks) { set(n.tracks.lfo.frequency, Math.min(60, speed / .2)); set(n.tracks.g.gain, Math.min(1, speed / 3) * .6); }
    // the ground (or water, or air) going by
    this.surfT -= dt; if (this.surfT <= 0 && p) { this.surfT = .3; this.road = S.water ? 'water' : S.air ? 'air' : this.f.surface(p.z === undefined ? { x: p.x, y: p.y } : p, this.thing); }
    if (S.air) { set(n.rf.frequency, 400 + 1800 * Math.min(1, frac)); set(n.rg.gain, Math.min(1, frac * 1.3) * .5); }
    else { const r = ROAD[this.road] || ROAD.stone; n.rf.type = r[0]; set(n.rf.frequency, r[1] * (.7 + .6 * Math.min(1, speed / 20))); n.rf.Q.value = r[2]; set(n.rg.gain, Math.min(1, speed / 22) * .45 * r[3]); }
    if (n.sg) set(n.sg.gain, clamp((this.slip - 2.5) / 6, 0, 1) * (HARD.has(this.road) || this.road === 'stone' ? .25 : .06));
    if (S.jet) { this.spool += (Math.max(.15, L) - this.spool) * Math.min(1, dt * .8); set(n.wh.frequency, 1400 + 3600 * this.spool); set(n.wg.gain, .15 + .25 * this.spool); set(n.jf.frequency, 300 + 1700 * this.spool); set(n.jg.gain, .3 + .7 * this.spool); }
    if (S.whine) { set(n.wh.frequency, 300 + 2600 * Math.min(1.2, frac)); set(n.wg.gain, Math.min(1, frac * 2) * (.15 + .25 * L)); }
    if (S.chuff) {   // a steam engine: four chuffs a turn of its driving wheels, and a hiss while it stands
      const r = this.thing.radius || .8; this.chuff += speed / (2 * Math.PI * r) * 4 * dt;
      if (this.chuff >= 1) { this.chuff %= 1; const len = Math.max(.07, .2 - speed * .005); for (const [m, a] of [[1, 1]]) noise(len * m, { vol: .07 * a * (.35 + .65 * L), from: 1700, to: 450, filter: 'bandpass', q: .7, out: n.master }); }
      set(n.jg.gain, speed < .5 ? .25 : .05);
    }
    if (S.rail && speed > .5) {   // over a rail joint every 18 metres: clack-clack as each pair of wheels crosses it
      this.rail += speed * dt;
      if (this.rail >= 18) { this.rail %= 18; const gap = Math.min(.6, 2.6 / speed), cars = Math.min(4, this.thing.cars?.length || 1), len = this.thing.cars?.[0]?.length || 12; for (let c = 0; c < cars; c++) for (const at of [0, gap]) { const when = (c * len) / speed + at; if (when < 2) noise(.03, { vol: .06, from: 3800, to: 2200, filter: 'bandpass', q: 1.3, at: when, out: n.master }); } }
    }
  }
  stop() {
    const n = this.n; this.n = null; if (!n) return;
    try { const t = n.ctx.currentTime; n.master.gain.cancelScheduledValues(t); n.master.gain.setTargetAtTime(0, t, .04); for (const x of n.srcs) x.stop(t + .2); } catch { /* stopped */ }
    if (this.f.ears) { this.f.ears.release(n.out); if (this.hearer) { const i = this.f.ears.live.indexOf(this.hearer); if (i >= 0) this.f.ears.live.splice(i, 1); this.hearer = null; } }
  }
}

/* ---------- Foley ---------- */
const all = new Set();   // (the Foleys playing engines this round: their engines stop with the round, and are made again by the next one's update())
register('foley', { stop: () => { for (const f of all) for (const w of f.watching) w.engine?.stop(); all.clear(); } });

export class Foley {
  /**
   * ears: a gs.sound.Ears (sounds at their points, behind walls; without one they play as they are); world: a gs.physics3d
   * World3D (its knocks sound by themselves); marks, weather, land: gs.outdoors Marks, gs.sky Weather, a gs.outdoors Land (what
   * is underfoot); ground: (x, z, y) => a material or nothing, the game's own say; volume: 0..1 (1); knocks: false to leave
   * the world's knocks alone; under: what is underfoot when nothing says (stone, or dirt on a land).
   */
  constructor({ ears = null, world = null, marks = null, weather = null, land = null, ground = null, volume = 1, knocks = true, under = null } = {}) {
    Object.assign(this, { ears, marks, weather, land, ground, volume, knocks, under });
    this.watching = []; this.hooked = new WeakSet(); this.budget = 0; this.budgetT = -1; this.last = new WeakMap(); this.made = new WeakMap();
    this.world = world; all.add(this);
  }
  /** The World3D whose knocks sound by themselves (set it again for a new one each round). */
  set world(w) { this._world = w || null; if (w && !this.hooked.has(w) && typeof w.onHit === 'function') { this.hooked.add(w); w.onHit((a, b, speed) => { if (this._world === w && this.knocks) this.knock(a, b, speed); }); } }
  get world() { return this._world; }

  /**
   * From now on this thing makes its own sounds. A gs.models.human: a footstep wherever a foot comes down. A gs.models.vehicle,
   * a World3D.vehicle() or a gs.vehicles Car or Kart: its engine. Anything else that moves (an Object3D, a World3D mover, or
   * { x, y, z }): steps paced out along its way. o: shoe ('boot', 'bare', 'paw', 'hoof'), weight (kg: 75), feet (2, or 4), pace
   * (metres a step), grounded: () => is it on the ground; for an engine: engine (one of Foley.engines), top (metres a second
   * at its top speed), throttle: () => 0..1, vol. Returns the thing.
   */
  watch(thing, o = {}) {
    this.unwatch(thing);
    const vehicle = o.engine || (thing.ctl && thing.chassis) || ('pace' in thing && 'drifting' in thing) || (thing.isObject3D && /^(car|truck|tank|train|boat|plane)$/.test(thing.kind || '') && (thing.wheels || thing.shell || thing.cars));
    const w = { thing, o, engine: vehicle ? new Engine(this, thing, o) : null, stride: thing.rig?.stride?.ok ? thing.rig.stride : null, dist: 0, was: null, last: [null, null], down: true, surf: null, surfAt: null, surfT: 0, n: 0 };
    this.watching.push(w); return thing;
  }
  unwatch(thing) { const i = this.watching.findIndex(w => w.thing === thing); if (i >= 0) { this.watching[i].engine?.stop(); this.watching.splice(i, 1); } }
  /** Stops every engine and forgets everything watched (a new round with new things). */
  clear() { for (const w of this.watching) w.engine?.stop(); this.watching.length = 0; }

  /** Each frame: footsteps and engines (the world's knocks come as it steps). */
  update(dt) {
    if (!(dt > 0)) return;
    all.add(this);
    for (const w of this.watching) { if (w.engine) w.engine.update(dt); else this.feet(w, dt); }
  }
  feet(w, dt) {
    const t = w.thing, o = w.o, st = w.stride;
    const kg = o.weight ?? (t.rig?.height ? 75 * (t.rig.height / 1.8) ** 3 : 75);
    if (st && st.on && st.a > .5 && t.rig.steps !== false) {   // a person whose steps are really taken: a step where each foot comes down
      const run = clamp((Math.hypot(st.vx || 0, st.vz || 0) - 2) / 3, 0, 1);
      for (let i = 0; i < 2; i++) {
        const f = st.feet[i]; if (!f.landed) continue;
        const was = w.last[i]; if (was && Math.hypot(f.T.x - was.x, f.T.z - was.z) < .04) continue;   // (the rig was not moved on since: the same footfall)
        w.last[i] = { x: f.T.x, z: f.T.z };
        this.step(f.T, null, { weight: kg, run, shoe: o.shoe, by: t, w });
      }
      return;
    }
    // anything else: steps paced out along its way
    const p = t.isObject3D ? (t.updateWorldMatrix?.(true, false), { x: t.matrixWorld.elements[12], y: t.matrixWorld.elements[13], z: t.matrixWorld.elements[14] }) : t.kind === 'mover' ? { x: t.pos.x, y: t.pos.y - t.height / 2, z: t.pos.z } : XYZ(t.position || t.pos || t);
    const flat = (t.position || t.pos || t).z === undefined && !t.isObject3D;
    if (!w.was) { w.was = { ...p }; return; }
    const d = Math.hypot(p.x - w.was.x, flat ? p.y - w.was.y : p.z - w.was.z); w.was = { ...p };
    if (d > Math.max(1.5, 40 * dt)) { w.dist = 0; return; }   // (moved there at once: no steps all the way)
    const grounded = o.grounded ? !!o.grounded() : t.grounded ?? true, sp = d / dt, run = clamp((sp - 2.2) / 3, 0, 1);
    if (grounded && !w.down) this.step(p, null, { weight: kg * 2, shoe: o.shoe, by: t, w, flat });   // (landing)
    w.down = grounded; if (!grounded) return;
    const feet = o.feet ?? 2, pace = o.pace ?? (feet === 4 ? .55 : .72) * (1 + .55 * run) * Math.max(.4, (kg / 75) ** .33);
    w.dist += d;
    while (w.dist >= pace) {
      w.dist -= pace;
      this.step(p, null, { weight: kg, run, shoe: o.shoe ?? (feet === 4 ? 'paw' : 'boot'), by: t, w, flat });
      if (feet === 4) this.step(p, null, { weight: kg, run, shoe: o.shoe ?? 'paw', by: t, w, flat, at: pace / Math.max(.5, sp) * .45 });
    }
  }

  /** What is underfoot at p (a material name). by: what is standing there (left out of the world's ray). */
  surface(p, by = null) {
    const x = p.x || 0, y = p.z === undefined ? 0 : p.y || 0, z = p.z === undefined ? p.y || 0 : p.z;
    if (this.ground) { const g = this.ground(x, z, y); if (g && KNOCK[g]) return g; }
    const W = this.weather, q = { x, y: y + .05, z };
    if (W?.snowAt && W.snow >= .4 && W.snowAt(q) > .012) return 'snow';
    if (this.marks?.kindAt) { const k = this.marks.kindAt(x, z, this._k ||= {}).kind; if (k) return k; }
    const wd = this._world;
    if (wd?.ray && p.z !== undefined) {
      const self = by?.rig ? null : by, hit = wd.ray({ x, y: y + .35, z }, { x: 0, y: -1, z: 0 }, 1.2, t => !t.collider?.isSensor?.() && t.kind !== 'mover' && t.tag !== 'ragdoll' && t !== self && t !== self?.chassis);
      if (hit) { const m = known(hit.thing?.sound) || materialOf(hit.mesh) || materialOf(hit.thing?.mesh); if (m) return m; }
    }
    return this.under || (this.land ? 'dirt' : 'stone');
  }

  // plays fn(outs) at p (or as it is, with no ears), counted by the voice cap as loud as `vol`
  at(p, vol, fn, len = .4) {
    if (sound.muted || !sound.volume) return false;
    const k = this.volume, mk = n => ({ t: (f, o) => tone(f * rnd(.96, 1.04), { ...o, vol: o.vol * k, out: n }), n: (l, o) => noise(l, { ...o, from: o.from * rnd(.93, 1.07), vol: o.vol * k * rnd(.85, 1.1), out: n }) });
    if (this.ears) return this.ears.at1(p.z === undefined && !this.ears.flat ? { x: p.x, y: 0, z: p.y } : p, vol * k, n => fn(mk(n)), { len });
    fn(mk(null)); return true;
  }
  /**
   * A footstep at p: on what is there (or on `on`, a material). o: weight (kg, 75), run (0..1 louder), shoe ('boot', 'bare',
   * 'paw', 'hoof'). Steps are no louder than the voice cap allows, and a puddle splashes too.
   */
  step(p, on = null, o = {}) {
    const c = o.w, now = audio()?.ctx.currentTime ?? 0, P = o.flat ? { x: p.x, y: p.y } : XYZ(p);
    let m = on;
    if (!m) { if (c && c.surf && c.surfAt && now - c.surfT < .35 && Math.hypot(P.x - c.surfAt.x, (P.z ?? P.y) - (c.surfAt.z ?? c.surfAt.y)) < .5) m = c.surf; else { m = this.surface(P, o.by); if (c) { c.surf = m; c.surfAt = { ...P }; c.surfT = now; } } }
    if (!STEP[m]) m = 'stone';
    const kg = o.weight ?? 75, w = clamp((kg / 75) ** .5, .25, 2.2) * (1 + .6 * (o.run || 0)), k = clamp((75 / kg) ** .12, .7, 1.5), shoe = SHOES[o.shoe] || SHOES.boot;
    const wet = this.weather?.wetAt && m !== 'water' && m !== 'snow' && P.z !== undefined ? this.weather.wetAt({ x: P.x, y: P.y + .05, z: P.z }) : 0;
    const at = o.at || 0;
    this.at(P, .05 * w, s => { const s2 = at ? { t: (f, q) => s.t(f, { ...q, at: (q.at || 0) + at }), n: (l, q) => s.n(l, { ...q, at: (q.at || 0) + at }) } : s; shoe(s2, m, w, k); if (wet > .5) STEP.water(s2, w * .5 * wet, k); }, .3 + at);
    return m;
  }
  /**
   * A knock at p: something made of `of` hit at speed (metres a second). o: size (metres, .5), mass (kg), soft (it hit something
   * soft: a ring is cut short). The harder and heavier, the louder; the bigger, the lower.
   */
  hit(p, of = 'wood', { speed = 4, size = .5, mass = null, soft = false } = {}) {
    const m = KNOCK[of] ? of : 'wood', kg = mass ?? 600 * size ** 3;
    const v = clamp((speed - .4) / 7, 0, 1) ** .8 * clamp(.35 + .25 * Math.log10(1 + kg * 4), .2, 1.2), k = clamp((.5 / Math.max(.05, size)) ** .45, .4, 2.6);
    if (v < .02) return false;
    return this.at(p.z === undefined ? { x: p.x, y: p.y } : XYZ(p), .08 * v, s => KNOCK[m](s, k, v, size, soft), m === 'metal' ? 1 : .4);
  }
  // two things in the world met (World3D.onHit): each sounds of what it is made of, the lighter one fully
  knock(a, b, speed) {
    if (speed < .5) return;
    const now = audio()?.ctx.currentTime ?? 0;
    if (now - this.budgetT > .033) { this.budgetT = now; this.budget = 0; }
    if (this.budget >= 6) return;   // (a heap settling: six knocks a frame at most)
    for (const t of [a, b]) { const l = this.last.get(t); if (l != null && now - l < .07) return; }
    this.budget++;
    const A = this.sideOf(a), B = this.sideOf(b), soft = SOFT.has(A.m) || SOFT.has(B.m);
    for (const t of [a, b]) this.last.set(t, now);
    // where: the moving one (a fixed one is everywhere)
    const at = !A.fixed ? A.p : B.p; if (!at) return;
    const [lo, hi] = A.kg <= B.kg ? [A, B] : [B, A];
    this.hit(at, lo.m, { speed, size: lo.size, mass: lo.kg, soft: soft && !SOFT.has(lo.m) });
    if (hi.m !== lo.m || hi.fixed) this.hit(at, hi.m, { speed: speed * (hi.fixed ? .7 : .8), size: hi.fixed ? 1.5 : hi.size, mass: hi.fixed ? lo.kg : hi.kg, soft: soft && !SOFT.has(hi.m) });
  }
  sideOf(t) {
    const fixed = t.kind === 'ground' || t.kind === 'floor' || t.fixed === true || (t.body?.isFixed?.() ?? false);
    let p = null; try { p = t.pos ? XYZ(t.pos) : null; } catch { /* freed */ }
    const kg = fixed ? Infinity : t.kind === 'mover' ? 75 : Math.max(.05, t.mass || 1), size = fixed ? 2 : t.kind === 'mover' ? .5 : Math.cbrt(kg / 600) * 1.2;
    let m = known(t.sound) || (t.tag === 'ragdoll' || t.kind === 'mover' ? 'body' : null);
    if (!m && t.mesh) { m = this.made.get(t.mesh); if (m === undefined) { m = materialOf(t.mesh); this.made.set(t.mesh, m); } }   // (read once a mesh)
    if (!m && fixed && p) m = this.surface({ x: p.x, y: p.y - .3, z: p.z });
    return { m: m || (fixed ? this.under || (this.land ? 'dirt' : 'stone') : 'wood'), fixed, p, kg, size };
  }
}
/** The materials things can be made of, and the engines a watched vehicle can have (watch(v, { engine })). */
Foley.materials = MATERIALS;
Foley.engines = Object.keys(ENGINES);
/** What a mesh or group is made of, as Foley hears it ('wood', 'metal'...; null if nothing says). */
Foley.materialOf = materialOf;

timed(Foley.prototype, 'update', 'world sounds');
