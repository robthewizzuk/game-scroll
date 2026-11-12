// gs.models.human(options): a person to see up close, sculpted in code. The body, the clothes and the
// kit are soft shapes melted together (field.js, human-shapes.js): a torso, legs and sleeves drawn as
// slices the way a tailor cuts them, a head with a brow, cheekbones, a nose, lips, ears and eyelids,
// hands with fingers, then what they wear: a tunic with its collar, pockets, buttons and belt, trousers
// bloused into boots, a helmet or a cap, straps, pouches, a pack. Creases, collars and hat brims sit in
// soft shadow worked out from the shapes themselves, so nothing needs a texture file.
// One skinned mesh per person on the skeleton gs.poses uses (the same Rig poses, blends and foot
// planting), with three levels of detail (see(), lod) so a squad costs little far off and the one in
// the scope is whole.
// Sculpting takes a second or two for a new cut of clothes, so it happens in background workers while
// the app shows "Loading…" (the same way a big library loads: make people in make() or reset()), and
// each piece is saved on the phone, so the next launch has them at once. People in the same cut of
// clothes share their pieces whatever their colours; twin() makes another of the very same person for free.
// Kit use only: games reach it as gs.models.human.
import { Bone, BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, Object3D, Quaternion, Skeleton, SkinnedMesh, Sphere, Vector3 } from 'three';
import { lumps } from './field.js';
import { BONES, PARENT, AT, PIVOT, HC, ARM, EYE, BROW, CORNER, mouthAt, eyeRim, ss, bump, jobsFor, sculpt, mirrored, turned, handPlan, fingerBones, other, VERSION, hashOf } from './human-shapes.js';
import { material } from './materials.js';
import { Rig, LIFELIKE } from '../poses.js';
import { reach } from '../characters.js';
import { Face } from '../skin.js';
import { pbr, HD } from '../hd3d.js';
import { StillLoading } from '../lazy.js';
import { fur } from './fur.js';

const PI = Math.PI, abs = Math.abs;

// ---- which material each kind of surface is drawn with (a maker's own slots say theirs: { colour, as })
const AS = { skin: 'skin', lips: 'skin', lid: 'skin', lash: 'skin', mouth: 'skin', eyes: 'eyes', hair: 'hair', brow: 'skin', top: 'cloth', legs: 'cloth', kit: 'cloth', trim: 'cloth', tab: 'cloth', band: 'cloth', hatband: 'cloth', scarf: 'cloth', hat: 'cloth', glove: 'cloth', roll: 'cloth',
  belt: 'leather', boots: 'leather', strap: 'leather', pouch: 'leather', sole: 'leather', holster: 'leather', helm: 'hard', visor: 'hard', wood: 'hard', flask: 'hard', case: 'hard', buckle: 'steel', button: 'steel', steel: 'steel', badge: 'steel' };
const CLASSES = ['skin', 'eyes', 'cloth', 'leather', 'hard', 'steel', 'hair'];


// ================================================================= pieces: in memory, saved, or sculpted in a worker
const made = new Map(), loading = new Map();   // key -> { p, t } (t: when it was last used); key -> a promise for it
const DB = 'gs-people', KEEP = 40, HELD = 64, clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let dbp = null;
const open = () => dbp ||= new Promise(res => {
  try {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore('pieces'); rq.result.createObjectStore('when'); };
    rq.onsuccess = () => res(rq.result); rq.onerror = rq.onblocked = () => res(null);
  } catch (e) { res(null); }
});
const tx = (db, mode, fn) => new Promise(res => { try { const t = db.transaction(['pieces', 'when'], mode), r = fn(t.objectStore('pieces'), t.objectStore('when')); t.oncomplete = () => res(r?.result); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } });
const idOf = key => VERSION + ':' + hashOf(key);
const good = p => p && p.n > 0 && p.P?.length === p.n * 3 && p.I?.length === 3 && Array.isArray(p.slots);
async function saved(key) {
  const db = await open(); if (!db) return null;
  const id = idOf(key), p = await tx(db, 'readonly', s => s.get(id)); if (!good(p)) return null;
  tx(db, 'readwrite', (s, w) => w.put(Date.now(), id));   // used just now: the last to be thrown away
  return p;
}
async function save(key, p) {
  const db = await open(); if (!db) return;
  const id = idOf(key); await tx(db, 'readwrite', (s, w) => { s.put(p, id); w.put(Date.now(), id); });
  // the newest KEEP stay
  const keys = await tx(db, 'readonly', (s, w) => w.getAllKeys()), times = await tx(db, 'readonly', (s, w) => w.getAll());
  if (keys && times && keys.length > KEEP) { const old = keys.map((k, i) => [k, times[i]]).sort((a, b) => a[1] - b[1]).slice(0, keys.length - KEEP); tx(db, 'readwrite', (s, w) => { for (const [k] of old) { s.delete(k); w.delete(k); } }); }
}
// the workers: up to four, started when there is sculpting to do and let go a few seconds after
const idle = [], waiting = new Map(), queue = [];
let workers = 0, off = typeof Worker !== 'function', jobId = 0, rest = 0;
const MOST = () => Math.max(1, Math.min(4, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency || 4) - 2));
const heavy = { trunk: 10, head: 4, arm: 3, hat: 2, pack: 2, gear: 2, hand: 1 };
function pump() {
  clearTimeout(rest);
  while (queue.length && !off) {
    let w = idle.pop();
    if (!w && workers < MOST()) {
      try {
        w = new Worker(new URL('./human-worker.js', import.meta.url), { type: 'module' }); workers++;
        w.onmessage = e => { const q = waiting.get(e.data.id); waiting.delete(e.data.id); idle.push(w); if (q) e.data.p ? q.res(e.data.p) : q.rej(new Error(e.data.error)); pump(); };
        // a worker that won't start (or dies): its job, and everything after, is sculpted here instead
        w.onerror = () => { off = true; workers--; for (const [id, q] of waiting) if (q.w === w) { waiting.delete(id); q.rej(new Error('worker')); } pump(); };
      } catch (e) { off = true; break; }
    }
    if (!w) break;
    const q = queue.shift(), id = ++jobId; q.w = w; waiting.set(id, q); w.postMessage({ id, job: { kind: q.job.kind, a: q.job.a } });
  }
  if (off) for (const q of queue.splice(0)) q.rej(new Error('worker'));
  if (!queue.length && !waiting.size) rest = setTimeout(() => { for (const w of idle.splice(0)) { w.terminate(); workers--; } }, 4000);
}
const inWorker = job => new Promise((res, rej) => { queue.push({ job, res, rej }); queue.sort((a, b) => heavy[b.job.kind] - heavy[a.job.kind]); pump(); });
const here = job => new Promise((res, rej) => setTimeout(() => { try { res(sculpt(job)); } catch (e) { rej(e); } }, 0));
const hold = (key, p) => { made.set(key, { p, t: clock() }); return p; };
/** A promise for a piece: from memory, the saved copy, or sculpted now (in a worker where it can be). */
function load(job) {
  const have = made.get(job.key); if (have) return Promise.resolve(have.p);
  let pr = loading.get(job.key);
  if (!pr) {
    pr = (async () => {
      let p = await saved(job.key);
      if (!p) { p = job.local || off ? await here(job) : await inWorker(job).catch(() => here(job)); save(job.key, p); }
      return hold(job.key, p);
    })().finally(() => loading.delete(job.key));
    loading.set(job.key, pr);
  }
  return pr;
}
// the HELD pieces used last stay in memory (the rest have their saved copies)
function tidy() { if (made.size <= HELD) return; for (const [k] of [...made].sort((a, b) => a[1].t - b[1].t).slice(0, made.size - HELD)) made.delete(k); }
const missing = list => { const out = new Map(); for (const o of list) for (const j of jobsFor(specOf(o))) if (!made.has(j.key)) out.set(j.key, j); return [...out.values()]; };

// ================================================================= materials (shared by everyone)
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const cloth = material('fabric', { colour: '#ffffff', repeat: [1, 1], closeUp: false, vertexColors: true }), leather = material('leather', { colour: '#ffffff', repeat: [1, 1], closeUp: false, vertexColors: true });
  cloth.normalScale.set(.55, .55); leather.normalScale.set(.3, .3);
  MATS = {
    skin: pbr('#ffffff', { rough: .56, vertexColors: true, sss: { colour: '#e0603c', scale: .5 } }), eyes: pbr('#ffffff', { rough: .1, clear: 1, vertexColors: true }),
    cloth, leather, hard: pbr('#ffffff', { rough: .52, vertexColors: true }), steel: pbr('#ffffff', { rough: .38, metal: .85, vertexColors: true }), hair: pbr('#ffffff', { rough: .62, vertexColors: true }),
    far: pbr('#ffffff', { rough: .8, vertexColors: true }),
  };
  for (const [k, m] of Object.entries(MATS)) m.name = 'human:' + k;
  return MATS;
}

// ================================================================= putting a person together
const ARMB = /^(arm|fore|twist|hand|(thumb|index|middle|ring|little)\d)[LR]$/;   // what sits in or out with the shoulders
const FINE = /^(twist|toe|(thumb|index|middle|ring|little)\d)[LR]$/, _m4 = new Matrix4();   // the small bones, which only show close up
/**
 * The skeleton a person of this build stands on: the bones' names, their parents and where each is (atOf), with
 * tree() to make them. Narrow or broad shoulders bring the arms (their bones, and all that rides them) in or out;
 * a bigger hand's finger joints are further apart, and a hand sculpted closed round a stock is bent already (HAND).
 * own: bones added for things that come off or hide (a hat, a pack), each at its parent's place.
 */
function frameOf(sp) {
  const bones = BONES.slice(), parent = { ...PARENT }, rest = { ...AT }, own = {}, ha = { limbs: sp.build.limbs, grip: sp.hands === 'grip' }, HAND = handPlan(ha);
  for (const [name, par, p] of fingerBones(ha)) { bones.push(name, other(name)); parent[name] = par; parent[other(name)] = other(par); rest[name] = p; rest[other(name)] = [-p[0], p[1], p[2]]; }
  const inset = .176 * (1 - sp.build.shoulders);
  const atOf = b => { const k = rest[b] ? b : own[b], a = rest[k]; return inset && ARMB.test(k) ? [a[0] - Math.sign(a[0]) * inset, a[1], a[2]] : a; };
  const tree = () => {
    const B = {};
    for (const b of bones) { const bone = new Bone(); bone.name = b; B[b] = bone; }
    for (const b of bones) { const par = parent[b], a = atOf(b); if (par) { const pa = atOf(par); B[b].position.set(a[0] - pa[0], a[1] - pa[1], a[2] - pa[2]); B[par].add(B[b]); } else B[b].position.set(...a); }
    B.shinL.userData.ikLength = B.shinR.userData.ikLength = .435; B.foreL.userData.ikLength = B.foreR.userData.ikLength = .27;
    B.spine.userData.pivot = PIVOT.spine; B.head.userData.pivot = PIVOT.head;   // (where the rib cage and the head turn about: see Rig.fill)
    return B;
  };
  return { bones, parent, own, HAND, inset, atOf, tree };
}
// people move the lifelike way: feet that roll, hips and shoulders that turn, a back and a neck that bend along their length
const rigOf = (B, scale) => { const rig = new Rig(B, { height: 1.8, poses: LIFELIKE, weight: 1, size: scale, full: true }); rig.feet = [B.footL, B.footR]; return rig; };
/** Kit use (tests, tools): the bare skeleton a person of these options stands on, with its rig and nothing sculpted (a Group with .bones and .rig). */
export function skeleton(o = {}) {
  const sp = specOf(o), B = frameOf(sp).tree(), root = new Group(), scale = (o.scale ?? 1) * (sp.fem ? .945 : 1);
  root.add(B.hips); root.scale.setScalar(scale); root.bones = B; root.rig = rigOf(B, scale); root.updateMatrixWorld(true);
  return root;
}
const DETAIL = [.5, .75, 1, 1];   // see(): how tall a person counts as, by quality tier
const DEF = { skin: '#d9ab86', hair: '#3b2a1a', eyes: '#141416', iris: '#5a7a9a', lips: '#a8665c' };
function specOf(o) {
  const fem = o.sex === 'f' || o.sex === 'female', g = o.girth ?? 1;
  const build = { shoulders: fem ? .9 : 1, chest: (fem ? .92 : 1) * g, waist: (fem ? .87 : 1) * g, hips: (fem ? 1.04 : 1) * g ** .5, limbs: fem ? .88 : 1, bust: fem ? 1 : 0, neck: fem ? .84 : 1, ...(o.build || {}) };
  const of = o.outfit || {}, top = { kind: 'shirt', colour: o.body ?? '#3a6ea5', sleeves: o.sleeves ?? 'long', pockets: 0, buttons: null, collar: undefined, ...(of.top || {}) };
  if (top.kind === 'tunic') { top.pockets ??= 4; } if (top.collar === undefined) top.collar = top.kind === 'shirt' ? false : null;
  const legs = { kind: 'trousers', colour: o.legs ?? '#2b2b38', ...(of.legs || {}) }, feet = { kind: 'shoes', colour: o.shoes ?? '#1a1a1a', ...(of.feet || {}) };
  const face = { jaw: o.jaw ?? (fem ? .86 : 1), chin: fem ? .82 : 1, brow: fem ? .72 : 1, nose: o.nose ?? (fem ? .84 : 1), lips: fem ? 1.12 : 1, cheeks: 1, eyes: fem ? 1.08 : 1, soft: fem ? 1 : 0, ...(o.face || {}) };
  const hat = of.hat ? { kind: 'helmet', ...of.hat } : null;
  return { build, top, legs, feet, face, hat, belt: of.belt || null, web: of.webbing || null, extras: of.extras || {}, pack: of.pack || null, gear: o.gear || [], hands: o.hands || 'open', gloves: of.gloves || null,
    hair: o.hair === null ? null : o.hair ?? DEF.hair, hairStyle: o.hairStyle || 'short', moustache: !!o.moustache, beard: o.beard === true ? .6 : Math.max(0, Math.min(1.5, +o.beard || 0)), fem, o };
}
// the colour of each slot for this person
function palette(sp) {
  const { top, legs, feet, hat, belt, web, o } = sp, c = v => v, ex = sp.extras;
  return {
    skin: o.skin ?? DEF.skin, lid: o.skin ?? DEF.skin, lash: '#' + new Color(o.skin ?? DEF.skin).lerp(new Color('#1c120c'), sp.fem ? .82 : .6).getHexString(), lips: sp.fem ? o.lips ?? DEF.lips : '#' + new Color(o.skin ?? DEF.skin).lerp(new Color(o.lips ?? DEF.lips), .5).getHexString(), mouth: '#2e1512', hair: sp.hair || '#3b2a1a', brow: sp.hair || o.eyes || '#2a1c12', glove: sp.gloves?.colour ?? '#4a3d2c',
    top: top.colour, trim: top.collar || top.cuffs || top.strapColour || top.colour, tab: top.tabs || top.colour, band: top.band || '#d9c25a', hatband: hat?.band ?? hat?.colour ?? '#4b5249', button: top.buttons || '#8a8270',
    legs: legs.colour, boots: feet.colour, sole: '#16120e', kit: feet.gaiter || ex.bag || ex.kit || '#6e6a4c', strap: web?.colour ?? belt?.colour ?? '#2b2723', pouch: web?.pouchColour ?? web?.colour ?? belt?.colour ?? '#2b2723',
    belt: belt?.colour ?? '#2b2723', buckle: belt?.buckle ?? '#8a8270', holster: ex.holsterColour ?? belt?.colour ?? '#2b2723', flask: ex.canteen === true ? '#4a4034' : ex.canteen || '#4a4034', scarf: ex.scarf === true ? top.colour : ex.scarf || top.colour,
    hat: hat?.colour ?? '#4b5249', helm: hat?.colour ?? '#4b5249', visor: hat?.visor ?? '#111111', badge: hat?.badge ?? '#b8a050', roll: sp.pack?.roll ?? '#5a5a54', case: sp.pack?.colour ?? '#454a40', steel: '#2a2c2e', wood: '#5a3e26',
    ...Object.fromEntries(Object.entries(o.slots || {}).map(([k, v]) => [k, c(typeof v === 'string' ? v : v.colour)])),
  };
}

/**
 * A person sculpted in code, on gs.poses' skeleton (rig, bones), in three levels of detail.
 * Looks: sex ('m' | 'f'), build ({ shoulders, chest, waist, hips, limbs }: 1 = average), girth, scale, skin,
 * hair (null: none), hairStyle ('short' | 'bun' | 'long' | 'bald'), iris, lips, moustache, beard (0..1.5 how long;
 * true: .6), strands (false: the sculpted hair alone; or { length (metres), layers, lean, tile }: the layers of
 * strands that lie over hair, moustache and beard close up, see fur.js), face ({ jaw, chin, brow, nose, lips,
 * cheeks, eyes }), hands ('open' | 'grip').
 * outfit: top { kind: 'shirt' | 'tunic' | 'blouse' | 'smock', colour, camo ([colour, colour]: blotches over it; legs and hat take it too), sleeves, collar (a colour, or false), pockets (0, 2, 4),
 * buttons (a colour), straps (shoulder straps), tabs (collar patches' colour), cuffs, band (an armband's colour, left arm) },
 * legs { kind: 'trousers' | 'breeches', colour }, feet { kind: 'shoes' | 'boots' | 'tall' | 'gaiters', colour, gaiter },
 * hat { kind: 'helmet' | 'cap' | 'beret' | 'wool' | 'hood', colour, band, badge, strap, hide }, belt { colour, buckle },
 * webbing { colour, y (straps up over the shoulders), cross, pouches (each side), kind: 'big' }, gloves { colour },
 * pack { kind: 'pack' | 'radio' | 'roll', colour, roll, hide }, extras { bag, canteen, holster, scarf } (true or a colour).
 * gear: [{ name, bone, shapes, cell, hide }]: your own kit as shapes (gs.models.sculpt's, with slot names) in the
 * person's space, riding a bone; hide: true gives it a bone of its own (person.gear[name].visible = false).
 * slots: { name: colour | { colour, as: 'cloth' | 'leather' | 'hard' | 'steel' | 'skin' } } for your own slot names.
 * The old options (body, legs, shoes: colours) still dress a plain person.
 * Returns a Group: rig, bones, mesh (the closest level), lods, lod (0 close .. 2 far; set it, or call
 * see(camera, screenHeightInPixels) each frame to pick by size on screen), gear, face, hair (the coat of strands
 * over the hair and beard, or null: hair.length, hair.lean, hair.level), twin() (another of the
 * same person, sharing everything but the skeleton: a squad from two or three faces costs little memory),
 * hold(thing, rightPoint, leftPoint) (both hands onto a thing he carries: after rig.update()).
 * Make people in make() or reset(): a cut of clothes this phone hasn't sculpted yet takes a second or two in
 * the background (the app shows "Loading…" and makes the game again), then it is saved. Several kinds of
 * people? Make them together with human.all([...]), first thing, so they are sculpted side by side.
 * now: true sculpts on the spot instead (tools and tests; the page stops while it does).
 */
export function human(o = {}) {
  const sp = specOf(o), jobs = jobsFor(sp), miss = jobs.filter(j => !made.has(j.key));
  if (miss.length) {
    if (o.now) for (const j of miss) hold(j.key, sculpt(j));
    else throw new StillLoading('gs.models.human', Promise.all(miss.map(load)));
  }
  const M = mats(), pal = palette(sp), pieces = [];
  // gear bones: a hat that can come off, a pack or a maker's own kit that can be hidden
  const { bones, parent, own: gearBones, HAND, inset, atOf, tree } = frameOf(sp), gearPiece = {};
  const ownBone = (name, par) => { bones.push(name); parent[name] = par; gearBones[name] = par; gearPiece[name] = pieces.length; return name; };
  const onBone = (p, b) => ({ ...p, names: p.names.map(() => b) });
  const moved = (p, dx) => { if (!dx) return p; const Q = p.P.slice(); for (let i = 0; i < p.n; i++) Q[i * 3] += dx; return { ...p, P: Q }; };
  let headP = null;
  for (const j of jobs) {
    const e = made.get(j.key), p = e.p; e.t = clock();
    if (j.kind === 'hand') pieces.push(moved(turned(p, 1), -inset), moved(turned(mirrored(p), -1), inset));   // sculpted hanging straight down, then turned out with the arms
    else if (j.kind === 'arm') { if (j.side !== 'R') pieces.push(moved(p, -inset)); if (j.side !== 'L') pieces.push(moved(mirrored(p), inset)); }   // sculpted as a left arm
    else if (j.kind === 'head') pieces.push(headP = p);
    else if (j.kind === 'hat') pieces.push(onBone(p, sp.hat.hide === false ? 'head' : ownBone('hat', 'head')));
    else if (j.kind === 'pack') pieces.push(onBone(p, sp.pack.hide ? ownBone('pack', 'spine') : 'spine'));
    else if (j.kind === 'gear') { const b = j.g.bone || 'spine'; pieces.push(onBone(ARMB.test(b) ? moved(p, b.endsWith('L') ? -inset : inset) : p, j.g.hide ? ownBone(j.g.name, b) : b)); }
    else pieces.push(p);
  }
  tidy();

  // ---- one set of points for all three levels, coloured for this person
  const n = pieces.reduce((a, p) => a + p.n, 0), P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), U = new Float32Array(n * 2), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), cls = new Uint8Array(n);
  const col = new Color(), dirt = new Color('#6a5c48'), browC = new Color(pal.brow), skinC = new Color(pal.skin), lipC = new Color(pal.lips), mouthC = new Color(pal.mouth), lashC = new Color(pal.lash), rim = eyeRim(sp.face.eyes), eyeC = [new Color(o.eyes ?? DEF.eyes), new Color(o.iris ?? DEF.iris), new Color('#2a221c'), new Color('#d9d3ca')];
  const asOf = name => (typeof o.slots?.[name] === 'object' && o.slots[name].as) || AS[name] || (name.startsWith('eye') ? 'eyes' : 'hard');
  const stub = sp.fem ? 0 : o.stubble ?? .35;
  const camoOf = {}; for (const [slot, part] of [['top', sp.top], ['legs', sp.legs], ['hat', sp.hat]]) if (part?.camo) camoOf[slot] = [].concat(part.camo).map(c => new Color(c));
  let at = 0; const offs = [];
  for (const p of pieces) {
    offs.push(at); P.set(p.P, at * 3);
    const cs = p.slots.map(s => { const a = asOf(s); return { a, camo: camoOf[s], k: CLASSES.indexOf(a), c: s.startsWith('eye') ? eyeC[+s[3]] : new Color(pal[s] ?? '#888888') }; }), bi = p.names.map(b => Math.max(0, bones.indexOf(b)));
    for (let i = 0; i < p.n; i++) {
      const j = at + i, x = p.P[i * 3], y = p.P[i * 3 + 1], z = p.P[i * 3 + 2], s = cs[p.slot[i]], ao = p.ao[i] / 255;
      const nx = p.N[i * 3] / 32767, ny = p.N[i * 3 + 1] / 32767, nz = p.N[i * 3 + 2] / 32767; N[j * 3] = nx; N[j * 3 + 1] = ny; N[j * 3 + 2] = nz;
      col.copy(s.c); cls[j] = s.k;
      if (s.camo) {   // camouflage: a second and a third colour brushed on in blotches
        const n1 = lumps(x * 13 + 3.1, y * 9 + 1.7, z * 13 + 5.3) + .35 * lumps(x * 37, y * 31, z * 37); col.lerp(s.camo[0], ss(.1, .26, n1));
        if (s.camo[1]) { const n2 = lumps(x * 17 - 4.2, y * 12 + 8.1, z * 17 + 2.6) + .35 * lumps(x * 41 + 9, y * 35, z * 41); col.lerp(s.camo[1], ss(.2, .36, n2)); }
      }
      if (s.a === 'cloth') { col.multiplyScalar(.94 + .09 * lumps(x * 9, y * 9, z * 9)); const mud = (1 - ss(0, .55, y)) * (.35 + .3 * lumps(x * 6, y * 4, z * 6)); if (mud > 0) col.lerp(dirt, Math.min(.5, mud)); }
      else if (s.a === 'leather') { col.multiplyScalar(.95 + .1 * lumps(x * 14, y * 14, z * 14)); const mud = (1 - ss(0, .12, y)) * .25; if (mud > 0) col.lerp(dirt, mud); }
      else if (s.a === 'skin' && p === headP) {
        const hy = y - HC[1], hz = z - HC[2], name = p.slots[p.slot[i]], face = name === 'lips' || name === 'brow' && hy > 0;
        if (face) col.copy(skinC);   // lips and brows are painted on below, softly, whatever the points were sculpted as
        const red = bump(hy, -.024, .024) * bump(abs(x), .044, .024) * ss(.0, .05, hz) * .07 + bump(hy, -.034, .012) * bump(x, 0, .012) * .07 + ss(.07, .078, abs(x)) * .1;   // cheeks, nose, ears
        col.r *= 1 + red * .35; col.g *= 1 - red * .5; col.b *= 1 - red * .55;
        if (stub && name !== 'brow') { const sh = ss(-.04, -.062, hy) * ss(-.03, .01, hz) * ss(-.165, -.12, hy) * stub; col.r *= 1 - sh * .2; col.g *= 1 - sh * .15; col.b *= 1 - sh * .08; }
        col.multiplyScalar(.975 + .035 * lumps(x * 55, y * 55, z * 55) + .02 * lumps(x * 190, y * 190, z * 190));   // skin is never one flat colour
        const so = bump(hy, .004, .014) * bump(abs(x), .032, .017) * (hz > .05 ? .16 : 0); col.multiplyScalar(1 - so);   // the eye sockets a little darker
        if (hz > .05 && hy > .008 && hy < .036) {   // brows: a soft stroke along the ridge (the painted core is the 'brow' slot)
          const ax = abs(x), [b0, b1, b2] = BROW, q = ax < b1[0] ? [b0, b1] : [b1, b2], t = Math.max(0, Math.min(1, (ax - q[0][0]) / (q[1][0] - q[0][0]))), dy = hy - (q[0][1] + (q[1][1] - q[0][1]) * t), dx = ax < b0[0] ? b0[0] - ax : ax > b2[0] ? ax - b2[0] : 0;
          const k = Math.max(name === 'brow' ? .5 : 0, ss((sp.fem ? .005 : .0062) - .002 * ss(b1[0], b2[0], ax), sp.fem ? .002 : .0031, Math.hypot(dx, dy))) * (sp.fem ? .92 : .94); if (k > 0) col.lerp(browC, k);
        }
        if (hz > .06 && hy < -.05 && hy > -.09) {   // lips, and the line between them (where the sculpting put them)
          const m = mouthAt(x, hy, sp.face); if (m[1] > 0) col.lerp(lipC, m[1] * (sp.fem ? .8 : .6));   // (a man's lips are nearer his skin's colour)
          if (m[2] > .02) col.lerp(mouthC, m[2] * (sp.fem ? .75 : .6));
        }
        if (hz > .06 && abs(hy) < .012 && abs(abs(x) - EYE[0]) < .019) {   // the lids' edges: a line of lashes along the upper one, a fainter one under the eye; the floor of the corner by the nose is pink flesh
          const r = rim(abs(x), hy), pink = name === 'lash' ? ss(.0098, .0118, EYE[0] - abs(x)) * (hz < EYE[2] + .0092 ? 1 : 0) : 0;
          if (name === 'lash') col.copy(skinC);
          if (pink > 0) { col.r *= 1 + .06 * pink; col.g *= 1 - .22 * pink; col.b *= 1 - .2 * pink; }
          const k = (r[1] ? ss(.0042, .0008, r[0]) * (sp.fem ? .8 : .5) : ss(.0014, .0002, r[0]) * (sp.fem ? .35 : .18)) * (1 - pink); if (k > 0) col.lerp(lashC, k);
        }
      }
      // creases in soft shadow (warmer on skin: light soaks through it)
      const k = s.a === 'eyes' ? ao : .28 + .72 * ao;
      if (s.a === 'skin') { C[j * 3] = col.r * Math.pow(k, .75); C[j * 3 + 1] = col.g * k; C[j * 3 + 2] = col.b * Math.pow(k, 1.15); } else { C[j * 3] = col.r * k; C[j * 3 + 1] = col.g * k; C[j * 3 + 2] = col.b * k; }
      // cloth and leather grain laid on by the way each point faces (metres)
      const ax = abs(nx), ay = abs(ny), az = abs(nz), sc = s.a === 'leather' ? 60 : 64;
      if (ay >= ax && ay >= az) { U[j * 2] = x * sc; U[j * 2 + 1] = z * sc; } else if (ax >= az) { U[j * 2] = z * sc; U[j * 2 + 1] = y * sc; } else { U[j * 2] = x * sc; U[j * 2 + 1] = y * sc; }
      const ws = p.SW[i * 4] + p.SW[i * 4 + 1] + p.SW[i * 4 + 2] + p.SW[i * 4 + 3] || 1;
      for (let q = 0; q < 4; q++) { SI[j * 4 + q] = bi[p.SI[i * 4 + q]]; SW[j * 4 + q] = p.SW[i * 4 + q] / ws; }
    }
    at += p.n;
  }
  const attrs = { position: new BufferAttribute(P, 3), normal: new BufferAttribute(N, 3), color: new BufferAttribute(C, 3), uv: new BufferAttribute(U, 2), skinIndex: new BufferAttribute(SI, 4), skinWeight: new BufferAttribute(SW, 4) };
  // each level: its triangles in groups by material (close: all six; middle: skin and the rest; far: one)
  const matsFor = [[M.skin, M.eyes, M.cloth, M.leather, M.hard, M.steel, M.hair], [M.skin, M.far], [M.far]], groupOf = [k => k, k => k <= 1 ? 0 : 1, () => 0];
  const geos = [0, 1, 2].map(L => {
    const by = matsFor[L].map(() => []);
    pieces.forEach((p, pi) => { const I = p.I[L], off = offs[pi]; for (let t = 0; t < I.length; t += 3) { const a = I[t] + off, b = I[t + 1] + off, c = I[t + 2] + off, k = cls[b] === cls[c] ? cls[b] : cls[a]; by[groupOf[L](k)].push(a, b, c); } });
    const g = new BufferGeometry(); for (const k in attrs) g.setAttribute(k, attrs[k]);
    const all = new Uint32Array(by.reduce((a, l) => a + l.length, 0)); let s = 0; by.forEach((l, i) => { all.set(l, s); if (l.length) g.addGroup(s, l.length, i); s += l.length; });
    g.setIndex(new BufferAttribute(n > 65535 ? all : new Uint16Array(all), 1));
    g.boundingSphere = new Sphere(new Vector3(0, .95, 0), 1.3); return g;
  });

  // ---- hair in strands (fur.js): layers of them over the sculpted hair, streaming from the crown of the head (from the
  // bun, for hair tied back), a moustache of them and a beard on the jaw; close up only. The layers are made in stand()
  const so = o.strands === false ? null : typeof o.strands === 'object' && o.strands ? o.strands : {}; let hairGeo = null;
  if (so && headP && (so.layers ?? fur.layers()) > 0 && (sp.hair && sp.hairStyle !== 'bald' || sp.beard || sp.moustache)) {
    const off = offs[pieces.indexOf(headP)], grow = new Float32Array(n), HAIR = CLASSES.indexOf('hair'), hc = new Color(pal.hair), fl = sp.face.lips, sf = sp.face.soft;
    // (under a hat the hair stays as it is sculpted, cropped close: there is little of it to see)
    const long = sp.hat ? 0 : sp.hairStyle === 'long' ? 1.5 : sp.hairStyle === 'bun' ? .75 : 1; let cols = null;
    for (let i = 0; i < headP.n; i++) {
      const j = off + i, name = headP.slots[headP.slot[i]];
      if (cls[j] === HAIR) { if (sp.hair) grow[j] = long; continue; }
      const x = headP.P[i * 3], hy = headP.P[i * 3 + 1] - HC[1], hz = headP.P[i * 3 + 2] - HC[2];
      if (name === 'brow') { if (hy < 0) grow[j] = .45; continue; }   // (a moustache; the brows stay painted)
      if (!sp.beard || (name !== 'skin' && name !== 'lips')) continue;
      // a beard: where stubble is painted (the jaw, the chin, the upper lip, under the chin), but not on the lips
      const lip = Math.min(Math.hypot(x / (.0245 - .0035 * sf), (hy + .0622) / (.0048 * fl)), Math.hypot(x / (.021 - .002 * sf), (hy + .073) / (.0062 * fl)));
      const k = ss(-.04, -.062, hy) * ss(-.03, .01, hz) * ss(-.165, -.12, hy) * ss(1.25, 2, lip);
      if (k > .02) { grow[j] = k * sp.beard * 1.7; cols ||= C.slice(); const a = (.28 + .72 * headP.ao[i] / 255) * (.75 + .25 * k); cols[j * 3] = hc.r * a; cols[j * 3 + 1] = hc.g * a; cols[j * 3 + 2] = hc.b * a; }
    }
    // the hair on the middle level's triangles (strands hide what a finer surface under them would add); a beard and a
    // moustache on the finest (the face under them is the finest, and would show through a coarser coat)
    const idx = [], hairy = j => cls[j] === HAIR;
    for (const [I, face] of [[headP.I[so.from ?? 1], false], [headP.I[0], true]]) for (let t = 0; t < I.length; t += 3) {
      const a = I[t] + off, b = I[t + 1] + off, c = I[t + 2] + off, onHair = hairy(a) || hairy(b) || hairy(c);
      if (face ? !onHair && grow[a] + grow[b] + grow[c] > 0 : onHair) idx.push(a, b, c);
    }
    hairGeo = fur.shell(geos[0], {
      index: idx, where: grow, colors: cols, length: so.length ?? .012, tile: so.tile ?? .06, thin: 0, ease: .25,
      uv: { centre: HC, crown: sp.hairStyle === 'bun' ? [HC[0], HC[1] + .03, HC[2] - .112] : [HC[0], HC[1] + .1, HC[2] - .045], droop: sp.hairStyle === 'long' ? .8 : .35 },
    });
    if (!hairGeo.userData.fur.tris) hairGeo = null;
  }

  // a loose copy of a hat or a pack (the helmet that flies off, the pack left behind): the middle level's
  // triangles in a plain mesh, its middle at the mesh's origin; userData.at is where that sits on its bone
  const looseGeo = {};
  const loose = name => {
    const pi = gearPiece[name]; if (pi == null) return null;
    let g = looseGeo[name];
    if (!g) {
      const p = pieces[pi], off = offs[pi], a = atOf(gearBones[name]), lp = P.slice(off * 3, (off + p.n) * 3), count = new Array(CLASSES.length).fill(0);
      for (let i = 0; i < p.n; i++) { lp[i * 3] -= a[0]; lp[i * 3 + 1] -= a[1]; lp[i * 3 + 2] -= a[2]; count[cls[off + i]]++; }
      g = looseGeo[name] = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(lp, 3)); g.setAttribute('normal', new BufferAttribute(N.slice(off * 3, (off + p.n) * 3), 3));
      g.setAttribute('color', new BufferAttribute(C.slice(off * 3, (off + p.n) * 3), 3)); g.setAttribute('uv', new BufferAttribute(U.slice(off * 2, (off + p.n) * 2), 2));
      g.setIndex(new BufferAttribute(p.I[1], 1)); g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new Vector3()); g.translate(-c.x, -c.y, -c.z); g.computeBoundingSphere();
      g.userData = { at: [c.x, c.y, c.z], mat: M[CLASSES[count.indexOf(Math.max(...count))]] || M.far };
    }
    const m = new Mesh(g, g.userData.mat); m.castShadow = sh; m.userData.at = g.userData.at; m.name = 'human:' + name;
    return m;
  };

  const sh = o.shadows !== false, scale = (o.scale ?? 1) * (sp.fem ? .945 : 1), tris = geos.map(g => g.index.count / 3);
  const stand = () => {
    const B = tree(), root = new Group();
    root.add(B.hips); B.armL.rotation.z = ARM; B.armR.rotation.z = -ARM; root.updateMatrixWorld(true);   // bound with the arms out, as sculpted
    const skel = new Skeleton(bones.map(b => B[b]));
    B.armL.rotation.z = B.armR.rotation.z = 0; root.updateMatrixWorld(true);
    // Further off (the middle and far levels) nobody can see a finger bend, a toe or the turn of a forearm: there each of
    // those small bones stands in as the one it hangs from (the same skin, no other set of weights), is not worked
    // out at all, and is left out of the scene while the person is at those levels. A squad far off then costs about
    // what it did on fifteen bones.
    const whole = bones.map((b, i) => { let k = b; while (FINE.test(k)) k = parent[k]; return k === b ? -1 : bones.indexOf(k); }), small = bones.filter((b, i) => whole[i] >= 0).map(b => B[b]);
    const far = new Skeleton(bones.map((b, i) => B[whole[i] < 0 ? b : bones[whole[i]]]), bones.map((b, i) => skel.boneInverses[whole[i] < 0 ? i : whole[i]]));
    far.update = function () {
      const M = this.boneMatrices, inv = this.boneInverses, bs = this.bones;
      for (let i = 0; i < bs.length; i++) { const w = whole[i]; if (w < 0) _m4.multiplyMatrices(bs[i].matrixWorld, inv[i]).toArray(M, i * 16); else M.copyWithin(i * 16, w * 16, w * 16 + 16); }
      if (this.boneTexture !== null) this.boneTexture.needsUpdate = true;
    };
    const lods = geos.map((g, L) => { const m = new SkinnedMesh(g, matsFor[L]); m.castShadow = m.receiveShadow = sh; m.name = 'human' + L; m.frustumCulled = true; m.boundingSphere = new Sphere(new Vector3(0, .95, 0), 1.7); root.add(m); m.bind(L ? far : skel, new Matrix4()); m.visible = L === 0; return m; });
    root.scale.setScalar(scale);
    root.name = 'human'; root.mesh = lods[0]; root.lods = lods; root.bones = B;
    root.rig = rigOf(B, scale);
    root.face = new Face(lods[0]);
    let cur = 0;
    Object.defineProperty(root, 'lod', { get: () => cur, set(v) {
      v = Math.max(0, Math.min(2, v | 0)); if (v === cur) return;
      lods[cur].visible = false; lods[v].visible = true;
      if (!v !== !cur) for (const bone of small) { const kids = bone.parent.children, i = kids.indexOf(bone); if (v) { if (i >= 0) kids.splice(i, 1); } else if (i < 0) kids.push(bone); }   // (the small bones: in the scene only close up)
      cur = v;
    } });
    /** Picks the level of detail by how tall the person stands on screen (pixels): call each frame, or now and then. A phone on a lower quality tier moves to the coarser levels sooner. */
    const wp = new Vector3();
    root.see = (cam, screenH = 800) => {
      const d = cam.position.distanceTo(root.getWorldPosition(wp)), px = 1.8 * root.scale.y / (2 * Math.max(.1, d) * Math.tan((cam.fov || 50) * PI / 360)) * screenH * (DETAIL[HD.tier] ?? 1);
      root.lod = px > (cur === 0 ? 190 : 230) ? 0 : px > (cur <= 1 ? 48 : 60) ? 1 : 2; return root.lod;
    };
    const gear = {};
    for (const name of Object.keys(gearBones)) { const bone = B[name]; gear[name] = { get visible() { return bone.scale.x > 0; }, set visible(on) { bone.scale.setScalar(on ? 1 : 0); }, bone, loose: () => loose(name) }; }
    // hands that take hold of things: a point in each palm, and both arms bent to bring them where they are wanted
    const palm = {}; for (const sd of ['L', 'R']) { const q = new Object3D(); q.position.set(sd === 'L' ? -.014 : .014, -.082, .012); B['hand' + sd].add(q); palm[sd] = q; }
    const tgt = new Vector3(), pole = new Vector3();
    /**
     * Both hands onto a thing he holds (a rifle, a wheel, a rope): right and left are points in the thing's own
     * space (null leaves that arm to its pose). Call after rig.update(), each frame he is seen close. elbows:
     * { right, left } where each elbow points, in the chest's space (default: the right out and down, the left down).
     */
    root.hold = (thing, right, left, elbows = {}) => {
      root.updateMatrixWorld(true); thing.updateWorldMatrix(true, false);
      const arms = [['R', right, elbows.right || [-.55, 0, -.02]], ['L', left, elbows.left || [.3, -.25, .22]]].filter(a => a[1]);
      // (twice: the shoulder goes with the arm, a little up and forward as it is raised, and the arm is then bent again from where the shoulder has gone)
      for (let pass = 0; pass < 2 && arms.length; pass++) {
        for (const [sd, pt, el] of arms) {
          tgt.set(pt[0], pt[1], pt[2]).applyMatrix4(thing.matrixWorld); pole.set(el[0], el[1], el[2]).applyMatrix4(B.spine.matrixWorld);
          reach(B['arm' + sd], B['fore' + sd], tgt, { pole, end: palm[sd] });
        }
        if (!pass) { root.rig.fill(); root.updateMatrixWorld(true); }
      }
      return root;
    };
    // hands and feet onto things in the world: the ball of each foot, the middle of a closed hand, each limb bent to reach
    const ball = {}, fist = {}; for (const sd of ['L', 'R']) { const q = new Object3D(); q.position.set(0, -.07, .1); B['foot' + sd].add(q); ball[sd] = q; const f = new Object3D(); f.position.set(sd === 'L' ? -.03 : .03, -.104, .004); B['hand' + sd].add(f); fist[sd] = sp.hands === 'grip' ? f : palm[sd]; }
    const q0 = new Quaternion(), q1 = new Quaternion(), q2 = new Quaternion(), q3 = new Quaternion(), ax = new Vector3(), nn = new Vector3(), dd = new Vector3(), cr = new Vector3();
    /**
     * Hands and feet onto points in the world (a rung, a ledge, a bar, a wheel): touch({ handL: point, handR: point,
     * footL: point, footR: point }), any of them. A hand meets its point with the palm (hands: 'grip' close round
     * it), a foot with the ball of the foot. Options: blend 0..1 how far each is carried there from its pose (a
     * number, or one a limb: { handL: .5 }), to ease a grip on and off; elbows, knees: { L, R } where each points,
     * in the chest's (hips') space; palms: { L, R } the way each palm faces, in the world (the forearm turns);
     * level: 0..1 how flat each foot is held to the floor he stands on (a number, or { L, R }). After rig.update().
     */
    root.touch = (pts, { blend = 1, elbows = {}, knees = {}, palms = {}, level = 0 } = {}) => {
      root.updateMatrixWorld(true);
      for (const [name, sd, up, low, end, at, bend] of [['handL', 'L', B.armL, B.foreL, fist.L, B.spine, elbows.L || [.45, -.5, -.25]], ['handR', 'R', B.armR, B.foreR, fist.R, B.spine, elbows.R || [-.45, -.5, -.25]],
        ['footL', 'L', B.legL, B.shinL, ball.L, B.hips, knees.L || [.14, -.3, 1]], ['footR', 'R', B.legR, B.shinR, ball.R, B.hips, knees.R || [-.14, -.3, 1]]]) {
        const pt = pts[name], k = typeof blend === 'number' ? blend : blend[name] ?? 1; if (!pt || k <= 0) continue;
        const hand = name[0] === 'h', tip = hand ? B['hand' + sd] : B['foot' + sd];
        q0.copy(up.quaternion); q1.copy(low.quaternion); q2.copy(tip.quaternion); q3.copy(tip.quaternion);
        pole.set(bend[0], bend[1], bend[2]).applyMatrix4(at.matrixWorld);
        tgt.set(pt.x ?? pt[0], pt.y ?? pt[1], pt.z ?? pt[2]);
        reach(up, low, tgt, { pole, end });
        const face = hand ? palms[sd] : null, flat = hand ? 0 : typeof level === 'number' ? level : level[sd] ?? 0;
        if (face) {
          // turn the hand about the forearm's length until the palm faces that way (as far as a wrist goes)
          low.updateWorldMatrix(true, true);
          ax.copy(tip.position).normalize(); const local = ax.clone(); ax.transformDirection(low.matrixWorld);
          nn.set(sd === 'L' ? -1 : 1, 0, 0).transformDirection(tip.matrixWorld); nn.addScaledVector(ax, -nn.dot(ax));
          dd.set(face.x ?? face[0], face.y ?? face[1], face.z ?? face[2]); dd.addScaledVector(ax, -dd.dot(ax));
          if (nn.lengthSq() > 1e-6 && dd.lengthSq() > 1e-6) {
            const an = Math.atan2(cr.crossVectors(nn, dd).dot(ax), nn.dot(dd));
            tip.quaternion.premultiply(q2.setFromAxisAngle(local, Math.max(-1.9, Math.min(1.9, an)))); q2.copy(tip.quaternion);   // (the hand turns at the wrist end of the forearm, whose skin follows it there and stays put at the elbow)
            reach(up, low, tgt, { pole, end });
          }
        }
        if (flat > 0) {
          // the sole flat to his own floor, the toes the way he faces; then the leg again, as the ball of the foot has moved
          low.updateWorldMatrix(true, false);
          low.getWorldQuaternion(q2).invert().multiply(root.getWorldQuaternion(new Quaternion()));
          tip.quaternion.slerp(q2, flat); q2.copy(tip.quaternion);
          reach(up, low, tgt, { pole, end });
        }
        if (hand) { root.rig.fill(); root.updateMatrixWorld(true); reach(up, low, tgt, { pole, end }); }   // (the shoulder has gone with the arm: once more from there)
        if (k < 1) { up.quaternion.slerpQuaternions(q0, q2.copy(up.quaternion), k); low.quaternion.slerpQuaternions(q1, q2.copy(low.quaternion), k); tip.quaternion.slerpQuaternions(q3, q2.copy(tip.quaternion), k); }
      }
      root.rig.fill();
      return root;
    };
    // the fingers: each joint's bone, the way it bends, and how far it is bent as sculpted
    const FB = {}; for (const sd of ['L', 'R']) FB[sd] = ['thumb', 'index', 'middle', 'ring', 'little'].map(f => [1, 2, 3].map(j => B[f + j + sd]).filter(Boolean));
    const CURL = [1.5, 1.75, 1.1], THUMB = [.55, .85], was = HAND.grip ? .8 : .2, fq = new Quaternion();
    /**
     * How far each hand's fingers are closed: fingers({ L: .5, R: 1 }): 0 flat, 1 a fist, null as sculpted (a little
     * curled; with hands: 'grip', closed round a stock). A number for the whole hand, or one a finger:
     * [thumb, index, middle, ring, little]. They stay as set until set again (poses leave fingers alone).
     */
    root.fingers = (o = {}) => {
      for (const sd of ['L', 'R']) {
        if (!(sd in o)) continue; const v = o[sd], m = sd === 'L' ? 1 : -1;
        FB[sd].forEach((list, f) => {
          const c = v == null ? null : typeof v === 'number' ? v : v[f] ?? null, k = c == null ? null : Math.max(-.2, Math.min(1.2, c));
          list.forEach((bone, j) => {
            if (k == null) bone.quaternion.identity();
            else if (f === 0) bone.quaternion.setFromAxisAngle(ax.set(HAND.turn[0], m * HAND.turn[1], m * HAND.turn[2]), (k - was) * THUMB[j]);   // (the other hand: the same turn in a mirror)
            else bone.rotation.set(0, 0, -m * (CURL[j] * k - HAND.bend[j]));
          });
        });
      }
      return root;
    };
    root.gear = gear; root.tris = tris; root.twin = stand;
    // (strands show once a head is big on screen: every layer when he stands about 800 pixels tall, every other one from about 360)
    root.hair = hairGeo ? fur(lods[0], { kind: 'hair', lean: .9, rough: .5, root: .55, tip: 1.3, ...so, shell: hairGeo, size: .6 }) : null;
    return root;
  };
  return stand();
}
/**
 * Several people at once: human.all([options, options...]) => the people, in the same order. Everything
 * that still needs sculpting is started together (side by side on the phone's cores), so the app waits once.
 */
human.all = list => {
  const miss = missing(list.filter(o => !o.now));
  if (miss.length) throw new StillLoading('gs.models.human', Promise.all(miss.map(load)));
  return list.map(o => human(o));
};
/** Starts sculpting whatever these people still need and throws the app's "still loading" if anything does (so it can come first in make(), before anything costly is built); nothing otherwise. */
human.need = list => { const miss = missing(list.filter(o => !o.now)); if (miss.length) throw new StillLoading('gs.models.human', Promise.all(miss.map(load))); };
/** For tools and tests: a promise that settles once human(options) for each of these would come straight back. */
human.ready = list => Promise.all(missing([].concat(list)).map(load)).then(() => true);
/** Forgets every saved sculpt (Settings › clear cache, tests). */
human.clear = async () => { made.clear(); const db = await open(); if (db) await tx(db, 'readwrite', (s, w) => { s.clear(); w.clear(); }); };
