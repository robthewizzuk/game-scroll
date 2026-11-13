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
import { AdditiveBlending, Bone, BufferAttribute, BufferGeometry, ClampToEdgeWrapping, Color, DataTexture, Group, InterleavedBuffer, InterleavedBufferAttribute, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh, Object3D, Quaternion, Raycaster, RGBAFormat, RGFormat, RepeatWrapping, SRGBColorSpace, Skeleton, SkinnedMesh, Sphere, UnsignedByteType, Vector3 } from 'three';
import { lumps } from './field.js';
import { BONES, PARENT, AT, BETWEEN, PIVOT, HC, ARM, EYE, esOf, eyeRim, MOUTH, faceBones, ss, bump, jobsFor, sculpt, mirrored, turned, handPlan, fingerBones, other, VERSION, hashOf } from './human-shapes.js';
import { material } from './materials.js';
import { Rig, LIFELIKE, Between } from '../poses.js';
import { reach } from '../characters.js';
import { LiveFace } from './human-face.js';
import { FACE, FACE_REAL, HAIR, IRIS, SEAM, faceUV, paintFace, paintDetail, paintHair, paintIris, paintSeams } from './human-paint.js';
import { pbr, HD } from '../hd3d.js';
import { StillLoading } from '../lazy.js';
import { sceneEdited } from '../scene-list.js';
import { fur } from './fur.js';
import { slimShared, floatsOf } from '../slim.js';

const PI = Math.PI, abs = Math.abs;

// ---- which material each kind of surface is drawn with (a maker's own slots say theirs: { colour, as })
const AS = { skin: 'skin', lips: 'skin', lid: 'skin', lash: 'skin', lashes: 'lash', browhair: 'lash', caruncle: 'eyes', mouth: 'hard', teeth: 'hard', tongue: 'hard', eyes: 'eyes', hair: 'hair', brow: 'skin', top: 'cloth', legs: 'cloth', kit: 'cloth', trim: 'cloth', tab: 'cloth', band: 'cloth', hatband: 'cloth', scarf: 'cloth', hat: 'cloth', glove: 'cloth', roll: 'cloth',
  belt: 'leather', boots: 'leather', strap: 'leather', pouch: 'leather', sole: 'leather', holster: 'leather', helm: 'hard', visor: 'hard', wood: 'hard', flask: 'hard', case: 'hard', buckle: 'steel', button: 'steel', steel: 'steel', badge: 'steel' };
const CLASSES = ['skin', 'eyes', 'cloth', 'leather', 'hard', 'steel', 'hair', 'lash'];   // (what is in the mouth is 'hard': plain, with none of the skin's pores)

// ---- the grain's seams, worked out once for a piece and kept with it (and with its mirrored and turned copies, made once too)
// The grain of skin, cloth and leather is laid on by the way each point faces (0 from above, 1 from the side, 2 from the front).
// A close-level triangle whose corners have it laid on from different ways, or at different sizes (leather against cloth), would
// have it smeared right across it (a whole tile and more in a few millimetres: a line of blank triangles along every seam). Such
// a triangle takes the way it faces itself and the size of what it is made of, and a corner laid on otherwise gets a twin laid on
// that way: the same point in everything else, numbered after the piece's own points. Only what has a grain.
const LEATHER = CLASSES.indexOf('leather'), HAIRK = CLASSES.indexOf('hair'), EYESK = CLASSES.indexOf('eyes'), GRAIN = CLASSES.map(c => c === 'skin' || c === 'cloth' || c === 'leather'), TILES = k => k === LEATHER ? 60 : 64;   // (tiles a metre)
const seamsOf = new WeakMap(), copies = new WeakMap();
const copyOf = (p, tag, make) => { let c = copies.get(p); if (!c) copies.set(p, c = {}); return c[tag] ||= make(); };
/** ks: the class (CLASSES) of each of the piece's slots. Returns { lay (a point), I (the close level's triangles, twins in), n, src, way, size (a twin) }. */
function seams(p, ks) {
  const sig = ks.join(); let s = seamsOf.get(p); if (s?.sig === sig) return s;
  const n = p.n, N = p.N, P = p.P, I = p.I[0], slot = p.slot, lay = new Uint8Array(n), twin = new Int32Array(n * 6).fill(-1), src = [], way = [], size = []; let J = null;
  for (let i = 0; i < n; i++) { const ax = abs(N[i * 3]), ay = abs(N[i * 3 + 1]), az = abs(N[i * 3 + 2]); lay[i] = ay >= ax && ay >= az ? 0 : ax >= az ? 1 : 2; }
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2], ka = ks[slot[a]], kb = ks[slot[b]], kc = ks[slot[c]], of = kb === kc ? kb : ka; if (!GRAIN[of]) continue;
    const sc = TILES(of); let k = lay[a];
    if (k !== lay[b] || k !== lay[c]) {
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const fx = abs(uy * vz - uz * vy), fy = abs(uz * vx - ux * vz), fz = abs(ux * vy - uy * vx); k = fy >= fx && fy >= fz ? 0 : fx >= fz ? 1 : 2;
    } else if (TILES(ka) === sc && TILES(kb) === sc && TILES(kc) === sc) continue;
    for (let e = 0; e < 3; e++) {
      const v = I[t + e]; if (lay[v] === k && TILES(ks[slot[v]]) === sc) continue;
      const key = v * 6 + k * 2 + (sc === 60 ? 1 : 0); let w = twin[key]; if (w < 0) { w = twin[key] = n + src.length; src.push(v); way.push(k); size.push(sc); }
      (J ||= Uint32Array.from(I))[t + e] = w;
    }
  }
  seamsOf.set(p, s = { sig, lay, I: J || I, n: src.length, src, way, size });
  return s;
}


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
const heavy = { trunk: 14, head: 4, collar: 2, hat: 2, pack: 2, gear: 2, hand: 1 };
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
// skin: pores and fine lines (the 'skin' recipe, a tile every 16 mm), and light through the ears (sss.thin: see `gsThin` below)
// (the pores are faint: any stronger and where a cheek turns from the sun they speckle it dark, like dirt)
// (a real face's skin, real: works out the light under it on WebGPU (hd3d-gpu.js FleshModel.skin), soft and warm where it turns from the light;
// WebGL keeps a softer rim, nearer the skin's own colour, standing for it)
const skinMat = (real = false) => {
  const m = material('skin', { colour: '#ffffff', repeat: [1, 1], closeUp: false, vertexColors: true, sss: { colour: '#e0603c', scale: .5, thin: true, skin: real } }); m.normalScale.set(.25, .25); m.name = real ? 'human:skin:real' : 'human:skin';
  if (real) { m.sheen = .3; m.sheenColor.set('#d08068'); }
  return m;
};
// A face's paint (human-paint.js): brows, the lashes' lines and lips in a small picture made in code, laid over the skin's own colour by the
// head's second set of UVs. One skin material for each look (people who look alike share it); its pores stay the recipe's.
const looks = new Map();
function skinOf(sp, pal, stubble) {
  const key = JSON.stringify([sp.face, sp.fem, stubble, pal.skin, pal.brow, pal.lips, pal.lash, pal.mouth]); let m = looks.get(key); if (m) return m;
  const lin = c => { const k = new Color(c); return [k.r, k.g, k.b]; };
  const t = new DataTexture(paintFace({ face: sp.face, fem: sp.fem, stubble, skin: lin(pal.skin), brow: lin(pal.brow), lips: lin(pal.lips), lash: lin(pal.lash), mouth: lin(pal.mouth) }), FACE.w, FACE.h, RGBAFormat, UnsignedByteType);
  t.colorSpace = SRGBColorSpace; t.channel = 1; t.wrapS = t.wrapT = ClampToEdgeWrapping; t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  // (the soft red rim that stands for light under the skin follows the paint too: none of it on a brow or a lash)
  m = skinMat(!!sp.face.real); m.map = t; m.color.setScalar(1 / FACE.plain); m.sheenColorMap = t; m.sheen /= FACE.plain;
  if (sp.face.real) {   // a real face's fine lines and oily skin, a picture laid on as the paint is: WebGPU bends the light by it (hd3d-gpu.js sss)
    const d = new DataTexture(paintDetail({ face: sp.face }), FACE_REAL.w, FACE_REAL.h, RGFormat, UnsignedByteType);
    d.channel = 1; d.wrapS = d.wrapT = ClampToEdgeWrapping; d.magFilter = LinearFilter; d.minFilter = LinearMipmapLinearFilter; d.generateMipmaps = true; d.needsUpdate = true; d.name = 'human:face-detail';
    m.userData.faceDetail = d;
  }
  looks.set(key, m); return m;
}
function mats() {
  if (MATS) return MATS;
  const cloth = material('fabric', { colour: '#ffffff', repeat: [1, 1], closeUp: false, vertexColors: true }), leather = material('leather', { colour: '#ffffff', repeat: [1, 1], closeUp: false, vertexColors: true });
  cloth.normalScale.set(.55, .55); leather.normalScale.set(.3, .3);
  MATS = {
    skin: skinMat(), eyes: pbr('#ffffff', { rough: .32, clear: 1, vertexColors: true }),
    cloth, leather, hard: pbr('#ffffff', { rough: .52, vertexColors: true }), steel: pbr('#ffffff', { rough: .38, metal: .85, vertexColors: true }), hair: pbr('#ffffff', { rough: .62, vertexColors: true }),
    far: pbr('#ffffff', { rough: .8, vertexColors: true }),
  };
  MATS.eyes.clearcoatRoughness = .04;   // (wet: a small sharp highlight over a softer iris)
  // a real face's eyes: the iris's fine work in a picture made in code (human-paint.js) over its colours, and no shine of their own: a film
  // over them has it (wetOf), drawn adding its light only, so the eye shows through it
  { const t = new DataTexture(paintIris(), IRIS.w, IRIS.w, RGBAFormat, UnsignedByteType); t.wrapS = t.wrapT = ClampToEdgeWrapping; t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; t.name = 'human:iris';
    MATS.eyesReal = pbr('#ffffff', { rough: .5, vertexColors: true }); MATS.eyesReal.map = t; MATS.eyesReal.color.setScalar(1 / IRIS.plain); }
  MATS.lash = pbr('#ffffff', { rough: .8, vertexColors: true }); MATS.lash.envMapIntensity = .3;   // (a real face's lashes: thin and dark, so a shine on them would be all reflection, and it came out pink, the skin's)
  MATS.wet = pbr('#000000', { rough: .05 }); Object.assign(MATS.wet, { transparent: true, depthWrite: false, blending: AdditiveBlending });
  // hair: combed strands in a small picture made in code (human-paint.js), over the hair's own colour and its sculpted locks
  { const { colour, normal } = paintHair(), tex = (px, srgb) => { const t = new DataTexture(px, HAIR.w, HAIR.h, RGBAFormat, UnsignedByteType); if (srgb) t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t; };
    MATS.hair.map = tex(colour, true); MATS.hair.normalMap = tex(normal, false); MATS.hair.normalScale.set(.6, .6); MATS.hair.color.setScalar(1 / HAIR.plain); }
  // a real face's hair: the same, with a shine stretched across the strands as off real hair (Kajiya and Kay's band round the head): three's own
  // anisotropy, rougher along the picture's u, which runs round the head, so the highlight is a band across the strands and narrow along them
  // (less of the sky in it than the shine off the sun or a lamp: under a grey sky dark hair had turned silver)
  MATS.hairReal = pbr('#ffffff', { rough: .52, vertexColors: true, aniso: .7 }); Object.assign(MATS.hairReal, { envMapIntensity: .25, specularIntensity: .55 });
  Object.assign(MATS.hairReal, { map: MATS.hair.map, normalMap: MATS.hair.normalMap }); MATS.hairReal.normalScale.set(.6, .6); MATS.hairReal.color.copy(MATS.hair.color);
  // cloth and leather: their seams and rows of stitching in a small picture made in code (human-paint.js), laid on by the lines the
  // sculpting runs along them (the second set of UVs: how far from the line, how far along it). It takes the place of the recipe's own
  // colour picture there (the grain's bumps stay)
  for (const [m, leatherLike] of [[cloth, false], [leather, true]]) {
    const { px, mips, plain } = paintSeams(leatherLike), t = new DataTexture(px, SEAM.w, SEAM.h, RGBAFormat, UnsignedByteType);
    t.mipmaps = mips; t.generateMipmaps = false; t.colorSpace = SRGBColorSpace; t.channel = 1; t.wrapS = ClampToEdgeWrapping; t.wrapT = RepeatWrapping;
    t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.anisotropy = 8; t.name = 'human:seams'; t.needsUpdate = true; m.map = t; m.color.setScalar(1 / plain);
  }
  for (const [k, m] of Object.entries(MATS)) m.name = 'human:' + k;
  return MATS;
}

// ================================================================= putting a person together
const ARMB = /^(shoulder|arm|elbow|fore|twist|hand|(thumb|index|middle|ring|little)\d)[LR]$/;   // what sits in or out with the shoulders
const FINE = /^((twist|toe|eye|lid|brow|browIn|corner|(thumb|index|middle|ring|little)\d)[LR]|jaw)$/, _m4 = new Matrix4();   // the small bones, which only show close up (fingers, toes, the face's own)
/**
 * The skeleton a person of this build stands on: the bones' names, their parents and where each is (atOf), with
 * tree() to make them. Narrow or broad shoulders bring the arms (their bones, and all that rides them) in or out;
 * a bigger hand's finger joints are further apart, and a hand sculpted closed round a stock is bent already (HAND).
 * own: bones added for things that come off or hide (a hat, a pack), each at its parent's place.
 */
function frameOf(sp) {
  const bones = BONES.slice(), parent = { ...PARENT }, rest = { ...AT }, own = {}, ha = { limbs: sp.build.limbs, grip: sp.hands === 'grip' }, HAND = handPlan(ha);
  for (const [name, par, p] of fingerBones(ha)) { bones.push(name, other(name)); parent[name] = par; parent[other(name)] = other(par); rest[name] = p; rest[other(name)] = [-p[0], p[1], p[2]]; }
  for (const [name, par, p] of faceBones(sp.face)) { bones.push(name); parent[name] = par; rest[name] = p; }   // the face's: eyes, lids, brows, jaw, the corners of the mouth
  const inset = .176 * (1 - sp.build.shoulders);
  const atOf = b => { const k = rest[b] ? b : own[b], a = rest[k]; return inset && ARMB.test(k) ? [a[0] - Math.sign(a[0]) * inset, a[1], a[2]] : a; };
  const tree = () => {
    const B = {};
    for (const b of bones) { const bone = BETWEEN[b] ? new Between() : new Bone(); bone.name = b; B[b] = bone; }
    for (const b of bones) { const par = parent[b], a = atOf(b); if (par) { const pa = atOf(par); B[b].position.set(a[0] - pa[0], a[1] - pa[1], a[2] - pa[2]); B[par].add(B[b]); } else B[b].position.set(...a); }
    for (const b in BETWEEN) { const [of, out] = BETWEEN[b], h = B[b]; h.of = B[of]; h.home = h.position.clone(); h.out = out && (out[0] || out[1] || out[2]) ? out : null; }   // the joints in between: each takes half its joint's turn by itself
    B.shinL.userData.ikLength = B.shinR.userData.ikLength = .435; B.foreL.userData.ikLength = B.foreR.userData.ikLength = .27;
    B.spine.userData.pivot = PIVOT.spine; B.head.userData.pivot = PIVOT.head;   // (where the rib cage and the head turn about: see Rig.fill)
    return B;
  };
  // a bone of its own for a thing that hangs (a bag, a canteen): where it hangs from
  const kit = (name, par, at) => { if (!rest[name]) { bones.push(name); parent[name] = par; rest[name] = at; } return name; };
  return { bones, parent, own, HAND, inset, atOf, tree, kit };
}
// people move the lifelike way: feet that roll, hips and shoulders that turn, a back and a neck that bend along their length
const rigOf = (B, scale, body) => { const rig = new Rig(B, { height: 1.8, poses: LIFELIKE, weight: 1, size: scale, full: true, body, momentum: true, follow: true }); rig.feet = [B.footL, B.footR]; return rig; };
/** Kit use (tests, tools): the bare skeleton a person of these options stands on, with its rig and nothing sculpted (a Group with .bones and .rig). */
export function skeleton(o = {}) {
  const sp = specOf(o), B = frameOf(sp).tree(), root = new Group(), scale = (o.scale ?? 1) * (sp.fem ? .945 : 1);
  root.add(B.hips); root.scale.setScalar(scale); root.bones = B; root.rig = rigOf(B, scale, root); root.face = root.rig.face = new LiveFace(root, B); root.updateMatrixWorld(true);
  return root;
}
const DETAIL = [.5, .75, 1, 1];   // see(): how tall a person counts as, by quality tier
const DEF = { skin: '#d9ab86', hair: '#3b2a1a', eyes: '#141416', iris: '#5a7a9a', lips: '#a8665c' };
// ---- looks: 'clean' (a simpler, friendlier face, the kit's people as they always were) or 'real' (a face as real as the kit can make it:
// life-size eyes, a real jaw, the folds and hollows of a real face, its age and weight, and from a seed a face of its own). Each person's own option.
const LOOKS = ['clean', 'real'];
const LOOK = 'clean';   // (each person's own: one game setting it for all would carry over into the next game in the feed)
// a seeded random number (0..1) maker: the same seed, the same person on every phone
const rngOf = seed => { let h = 2166136261 >>> 0; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); let a = h >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// skin from very fair to very dark (each a little warmer or cooler), hair and eyes as they come with it
const SKINS = ['#f3d6c4', '#ecc6a8', '#e2b496', '#d4a07c', '#c48c64', '#ac7450', '#8e5a3a', '#6e4429', '#55321e', '#3c2216'];
const HAIRS = { dark: ['#141210', '#1e1712', '#2a1c12', '#3b2a1a'], light: ['#141210', '#2a1c12', '#3b2a1a', '#5a3c22', '#6a4a2c', '#8a6a42', '#b89a68', '#7a3418'] };
const IRISES = { dark: ['#2a1810', '#3a2416', '#2e1c10', '#4a3020'], light: ['#3a2416', '#4a3020', '#5a7a9a', '#4a6a3a', '#6a8090', '#5a4028', '#7a8ea0'] };
/**
 * A real face's measures, and its colouring where the game gave none: from the seed (or the game's own face), with its age and weight
 * worked into them (older: thinner lips, a longer nose, bigger ears, lids that hang lower and open less).
 */
export function realFace(o, fem, base) {
  const r = rngOf(o.seed ?? JSON.stringify([o.sex, o.skin, o.hair, o.age])), g = (k = 1) => (r() + r() + r() - 1.5) * k * 1.15, has = o.seed != null;
  const age = Math.max(16, Math.min(95, o.age ?? (has ? Math.round(20 + 45 * r()) : 30))), a = ss(24, 78, age), fat = Math.max(0, Math.min(1, o.weight ?? (has ? .5 + g(.17) : .5)));
  const vary = (v, k) => has ? v * (1 + g(k)) : v;
  const f = {
    ...base, real: 1, es: 1, age, fat, jaw: vary(base.jaw, .06), chin: vary(base.chin, .07), brow: vary(base.brow, .1), nose: vary(base.nose, .06) * (1 + .05 * a), lips: vary(base.lips * 1.12, .1) * (1 - .22 * a),
    cheeks: has ? base.cheeks + g(.25) : base.cheeks, eyes: vary(base.eyes * (fem ? .97 : 1), .04) * (1 - .07 * a), noseW: vary(1, .08), bridge: vary(1, .12), tip: has ? Math.max(-1, Math.min(1, g(.6))) : 0,
    tilt: has ? g(.045) : 0, lidFold: Math.max(0, Math.min(1, (has ? .3 + g(.28) : .3) + .3 * a)), faceW: vary(1, .035), ears: vary(1, .07) * (1 + .08 * a), asym: has ? .3 + .6 * r() : .3, aseed: has ? Math.floor(r() * 1e3) / 1e2 : 0, freckles: has && r() < .35 ? .3 + .7 * r() : 0,
    ...(o.face || {}),
  };
  for (const k in f) if (typeof f[k] === 'number' && k !== 'age') f[k] = Math.round(f[k] * 1e4) / 1e4;   // (a few figures: the face names the saved shape)
  const tone = o.skin ? null : has ? Math.min(SKINS.length - 1.001, r() * SKINS.length) : null;
  const dark = tone != null ? tone > 5.5 : o.skin ? new Color(o.skin).getHSL({}).l < .38 : false, pickOf = l => l[Math.floor(r() * l.length)];
  const skin = tone == null ? null : '#' + new Color(SKINS[Math.floor(tone)]).lerp(new Color(SKINS[Math.ceil(tone)]), tone % 1).getHexString();
  let hair = o.hair === undefined && has ? pickOf(dark ? HAIRS.dark : HAIRS.light) : undefined;
  const grey = ss(38, 72, age) * (.55 + .45 * r());
  if (hair && grey > 0) hair = '#' + new Color(hair).lerp(new Color('#b8b6b0'), grey).getHexString();
  return { f, skin, hair, iris: o.iris === undefined && has ? pickOf(dark ? IRISES.dark : IRISES.light) : null };
}
function specOf(o) {
  const fem = o.sex === 'f' || o.sex === 'female', g = o.girth ?? 1, real = (LOOKS.includes(o.look) ? o.look : LOOK) === 'real';
  const build = { shoulders: fem ? .9 : 1, chest: (fem ? .92 : 1) * g, waist: (fem ? .87 : 1) * g, hips: (fem ? 1.04 : 1) * g ** .5, limbs: fem ? .88 : 1, bust: fem ? 1 : 0, neck: fem ? .8 : .92, ...(o.build || {}) };
  const of = o.outfit || {}, top = { kind: 'shirt', colour: o.body ?? '#3a6ea5', sleeves: o.sleeves ?? 'long', pockets: 0, buttons: null, collar: undefined, ...(of.top || {}) };
  if (top.kind === 'tunic') { top.pockets ??= 4; } if (top.collar === undefined) top.collar = top.kind === 'shirt' ? false : null;
  const legs = { kind: 'trousers', colour: o.legs ?? '#2b2b38', ...(of.legs || {}) }, feet = { kind: 'shoes', colour: o.shoes ?? '#1a1a1a', ...(of.feet || {}) };
  let face = { jaw: o.jaw ?? (fem ? .94 : 1), chin: fem ? .9 : 1, brow: fem ? .62 : .82, nose: o.nose ?? (fem ? .86 : 1), lips: fem ? 1.12 : 1, cheeks: 1, eyes: fem ? 1.08 : 1, soft: fem ? 1 : 0, ...(o.face || {}) };
  let seeded = null;
  if (real) {
    // a real neck is fuller than the clean one's (and a heavy person's fuller still)
    seeded = realFace(o, fem, face); face = seeded.f; if (!o.build?.neck) build.neck = (fem ? .87 : 1.02) * (1 + .1 * (face.fat - .5) * 2);
    o = { ...o, skin: o.skin ?? seeded.skin ?? undefined, hair: o.hair === undefined ? seeded.hair ?? undefined : o.hair, iris: o.iris ?? seeded.iris ?? undefined };
  }
  const hat = of.hat ? { kind: 'helmet', ...of.hat } : null;
  return { build, top, legs, feet, face, hat, belt: of.belt || null, web: of.webbing || null, extras: of.extras || {}, pack: of.pack || null, gear: o.gear || [], hands: o.hands || 'open', gloves: of.gloves || null,
    hair: o.hair === null ? null : o.hair ?? DEF.hair, hairStyle: o.hairStyle || 'short', moustache: !!o.moustache, beard: o.beard === true ? .6 : Math.max(0, Math.min(1.5, +o.beard || 0)), fem, o };
}
// an eye's colours, band by band from the pupil out (human-shapes.js eyeball()): the pupil, the iris (paler and warmer by the pupil, darker
// at its edge), the dark ring round it, and the white (greyer by the iris, pinker far round, where the lids' corners are)
function eyeColours(pupil, iris) {
  const p = new Color(pupil), i = new Color(iris), w = new Color('#d2ccc3');
  return [p, i.clone().lerp(new Color('#d6b47c'), .12).multiplyScalar(.56), i.clone().multiplyScalar(.44), i.clone().multiplyScalar(.3), i.clone().multiplyScalar(.12).lerp(new Color('#1a1512'), .6), w.clone().lerp(new Color('#8f98a2'), .3), w, w.clone().lerp(new Color('#c9a096'), .4)];
}
// A real face's wet eyes, a mesh of their own over the eyes that adds only its shine (MATS.wet), so the eye shows through it: over each eye
// the clear cornea, a cap over the iris more sharply curved than the ball (as eyeball() makes its normals: the wet highlight on it is small
// and slides as the eye turns), running on into the film of tears over the white, on that eye's bone; and along each lower lid, where its edge
// meets the eye, the line of tears that lies there, on the head's bone. bones: the skeleton's bone names (each point's bone by its place).
const wets = new Map();
function wetOf(f, bones) {
  const es = esOf(f), r = .0122 * es, key = JSON.stringify([f.eyes, es, f.tilt || 0, bones.indexOf('eyeL'), bones.indexOf('eyeR'), bones.indexOf('head')]);
  let g = wets.get(key); if (g) return g;
  const P = [], N = [], SI = [], I = [], LIMB = 34 * .86 * PI / 180, n = 36, rim = eyeRim(f.eyes, es, f.tilt || 0), e = [0, 0];
  const sin = Math.sin, cos = Math.cos;
  for (const [s, bone] of [[1, 'eyeL'], [-1, 'eyeR']]) {
    const c = [s * EYE[0], HC[1] + EYE[1], HC[2] + EYE[2]], bi = Math.max(0, bones.indexOf(bone)), base = P.length / 3, rings = [0, 5, 10, 15, 20, 24, 27, 29.24, 32, 38, 46, 56, 68, 82, 100];
    for (const deg of rings) for (let i = 0; i < n; i++) {
      const a = deg * PI / 180, t = i / n * PI * 2, u = Math.min(1, a / LIMB), up = (1 - u * u) ** 2, slope = -4 * u * (1 - u * u) / LIMB, rr = r + .00025 * up + .00005, q = .0011 * slope / r;
      const ex = sin(a) * cos(t), ey = sin(a) * sin(t), ez = cos(a), nx = ex - q * cos(a) * cos(t), ny = ey - q * cos(a) * sin(t), nz = ez + q * sin(a), nl = Math.hypot(nx, ny, nz);
      P.push(c[0] + ex * rr, c[1] + ey * rr, c[2] + ez * rr); N.push(nx / nl, ny / nl, nz / nl); SI.push(bi);
    }
    for (let q = 0; q < rings.length - 1; q++) for (let i = 0; i < n; i++) { const a = base + q * n + i, b = base + q * n + (i + 1) % n; I.push(a, b + n, b, a, a + n, b + n); }
    // the line of tears: a thin tube along the lower lid's edge, as far as the eye reaches under it
    const hb = Math.max(0, bones.indexOf('head')), path = [];
    for (let k = 0; k <= 24; k++) {
      const t = -.8 + 1.65 * k / 24; rim.edge(t, false, e); const dx = e[0] - EYE[0], dy = e[1] - EYE[1], d2 = dx * dx + dy * dy; if (d2 > (.97 * r) ** 2) continue;
      const dz = Math.sqrt(r * r - d2), k2 = (r + .00012) / r; path.push([s * (EYE[0] + dx * k2), HC[1] + EYE[1] + dy * k2, HC[2] + EYE[2] + dz * k2, Math.sin(PI * k / 24) ** .5]);
    }
    const b0 = P.length / 3;
    for (let k = 0; k < path.length; k++) {
      const p = path[k], p0 = path[Math.max(0, k - 1)], p1 = path[Math.min(path.length - 1, k + 1)], T = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], tl = Math.hypot(...T) || 1; T[0] /= tl; T[1] /= tl; T[2] /= tl;
      const R = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], rl = Math.hypot(...R); R[0] /= rl; R[1] /= rl; R[2] /= rl;   // (round the tube: out from the eye, and across)
      const B = [T[1] * R[2] - T[2] * R[1], T[2] * R[0] - T[0] * R[2], T[0] * R[1] - T[1] * R[0]], tr = .00026 * es * p[3];
      for (let v = 0; v < 4; v++) { const an = v * PI / 2, nx = R[0] * cos(an) + B[0] * sin(an), ny = R[1] * cos(an) + B[1] * sin(an), nz = R[2] * cos(an) + B[2] * sin(an); P.push(p[0] + tr * nx, p[1] + tr * ny, p[2] + tr * nz); N.push(nx, ny, nz); SI.push(hb); }
    }
    for (let k = 0; k < path.length - 1; k++) for (let v = 0; v < 4; v++) { const a = b0 + k * 4 + v, b = b0 + k * 4 + (v + 1) % 4; I.push(a, b, b + 4, a, b + 4, a + 4); }
  }
  g = new BufferGeometry(); const m = P.length / 3, W = new Float32Array(m * 4), J = new Uint16Array(m * 4); for (let i = 0; i < m; i++) { J[i * 4] = SI[i]; W[i * 4] = 1; }
  g.setAttribute('position', new BufferAttribute(new Float32Array(P), 3)); g.setAttribute('normal', new BufferAttribute(new Float32Array(N), 3));
  g.setAttribute('skinIndex', new BufferAttribute(J, 4)); g.setAttribute('skinWeight', new BufferAttribute(W, 4)); g.setIndex(I);
  g.boundingSphere = new Sphere(new Vector3(0, .95, 0), 1.3); wets.set(key, g); return g;
}
// a real face's lashes: darker and greyer than the hair (near black for dark or red hair), lighter only for fair or grey hair
const lashColour = hair => { const h = { h: 0, s: 0, l: 0 }; new Color(hair || '#3b2a1a').getHSL(h); return '#' + new Color('#120e0c').lerp(new Color('#6a625a'), ss(.3, .7, h.l)).getHexString(); };
// the colour of each slot for this person
function palette(sp) {
  const { top, legs, feet, hat, belt, web, o } = sp, c = v => v, ex = sp.extras;
  return {
    lashes: lashColour(sp.hair), browhair: '#' + new Color(sp.hair || o.eyes || '#2a1c12').multiplyScalar(.6).getHexString(), caruncle: '#' + new Color(o.skin ?? DEF.skin).lerp(new Color('#b8625c'), .4).multiplyScalar(.9).getHexString(),
    teeth: '#d6cdbb', tongue: '#7d3f3c', skin: o.skin ?? DEF.skin, lid: o.skin ?? DEF.skin, lash: '#' + new Color(o.skin ?? DEF.skin).lerp(new Color('#1c120c'), sp.fem ? .94 : .86).getHexString(), lips: sp.fem ? o.lips ?? DEF.lips : '#' + new Color(o.skin ?? DEF.skin).lerp(new Color(o.lips ?? DEF.lips), .62).getHexString(), mouth: '#2e1512', hair: sp.hair || '#3b2a1a', brow: '#' + new Color(sp.hair || o.eyes || '#2a1c12').multiplyScalar(.6).getHexString(), glove: sp.gloves?.colour ?? '#4a3d2c',
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
 * hair (null: none), hairStyle ('short' (a woman's: a bob) | 'bun' | 'long' | 'bald'), iris, lips, moustache, beard (0..1.5 how long;
 * true: .6), strands (the layers of strands that lie over a moustache and a beard close up, see fur.js: true, or
 * { length (metres), layers, lean, tile }, for the hair of the head too; false for none), face ({ jaw, chin, brow, nose, lips,
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
 * see(camera, screenHeightInPixels) each frame to pick by size on screen), gear, face (a live face, human-face.js:
 * it blinks and its eyes move by themselves; look(point), say(text), set('smile', 1), wince(), awake), hair (the coat of strands
 * over a beard, a moustache and (when asked: strands) the hair, or null: hair.length, hair.lean, hair.level), twin() (another of the
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
  const M = mats(), pal = palette(sp), pieces = [], stub = sp.fem ? 0 : o.stubble ?? .35, skin = skinOf(sp, pal, stub);
  // gear bones: a hat that can come off, a pack or a maker's own kit that can be hidden
  const { bones, parent, own: gearBones, HAND, inset, atOf, tree, kit } = frameOf(sp), gearPiece = {}, hung = [];   // (hung: what swings as he moves: [bone, how])
  const ownBone = (name, par) => { bones.push(name); parent[name] = par; gearBones[name] = par; gearPiece[name] = pieces.length; return name; };
  // (from: the piece this is a copy of, moved or put on another bone: the same shape, so its seams are that one's)
  const onBone = (p, b) => ({ ...p, names: p.names.map(() => b), from: p.from || p });
  const moved = (p, dx) => { if (!dx) return p; const Q = p.P.slice(); for (let i = 0; i < p.n; i++) Q[i * 3] += dx; return { ...p, P: Q, from: p.from || p }; };
  let headP = null;
  for (const j of jobs) {
    const e = made.get(j.key), p = e.p; e.t = clock();
    if (j.kind === 'hand') pieces.push(moved(copyOf(p, 'L', () => turned(p, 1)), -inset), moved(copyOf(p, 'R', () => turned(mirrored(p), -1)), inset));   // sculpted hanging straight down, then turned out with the arms
    else if (j.kind === 'head') pieces.push(headP = p);
    else if (j.kind === 'hat') pieces.push(onBone(p, sp.hat.hide === false ? 'head' : ownBone('hat', 'head')));
    else if (j.kind === 'pack') { const sa = atOf('spine'); pieces.push(onBone(p, ownBone('pack', 'spine'))); hung.push(['pack', { pivot: [0, 1.45 - sa[1], -.1 - sa[2]], swing: .008, bounce: .0016, stiff: 200, damp: 12, most: .08, away: [0, 0, -1] }]); }   // (it hangs from the shoulders)
    else if (j.kind === 'gear') { const b = j.g.bone || 'spine'; pieces.push(onBone(ARMB.test(b) ? moved(p, b.endsWith('L') ? -inset : inset) : p, j.g.hide ? ownBone(j.g.name, b) : b)); }
    else { if (p.hang) for (const name in p.hang) { const { at, ...how } = p.hang[name]; hung.push([kit(name, 'hips', at), how]); } pieces.push(p); }   // (the trunk, and what hangs from its belt)
  }
  tidy();

  // ---- one set of points for all three levels, coloured for this person (after each piece's own points, the twins its seams need)
  const col = new Color(), dirt = new Color('#6a5c48'), skinC = new Color(pal.skin), eyeC = eyeColours(o.eyes ?? DEF.eyes, o.iris ?? DEF.iris), uv1 = [0, 0];
  const asOf = name => (typeof o.slots?.[name] === 'object' && o.slots[name].as) || AS[name] || (name.startsWith('eye') ? 'eyes' : 'hard');
  const camoOf = {}; for (const [slot, part] of [['top', sp.top], ['legs', sp.legs], ['hat', sp.hat]]) if (part?.camo) camoOf[slot] = [].concat(part.camo).map(c => new Color(c));
  const slotsOf = pieces.map(p => p.slots.map(s => { const a = asOf(s); return { a, camo: camoOf[s], k: CLASSES.indexOf(a), c: s.startsWith('eye') ? eyeC[+s[3]] : new Color(pal[s] ?? '#888888') }; }));
  const seam = pieces.map((p, pi) => seams(p.from || p, slotsOf[pi].map(s => s.k)));
  const n = pieces.reduce((a, p, pi) => a + p.n + seam[pi].n, 0), P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), U = new Float32Array(n * 2), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), cls = new Uint8Array(n), TU = new Float32Array(n * 4);   // (TU: how thin the flesh is and how open behind, then where the point is on the face's paint)
  let at = 0; const offs = [];
  for (let pi = 0; pi < pieces.length; pi++) {
    const p = pieces[pi], cs = slotsOf[pi], sm = seam[pi], LAY = sm.lay, bi = p.names.map(b => Math.max(0, bones.indexOf(b)));
    offs.push(at); P.set(p.P, at * 3); if (p.thin) for (let i = 0; i < p.n; i++) { TU[(at + i) * 4] = p.thin[i * 2] / 255; TU[(at + i) * 4 + 1] = p.thin[i * 2 + 1] / 255; }   // (how thin the flesh is, and how open behind: light comes through an ear)
    for (let i = 0; i < p.n; i++) {
      const j = at + i, x = p.P[i * 3], y = p.P[i * 3 + 1], z = p.P[i * 3 + 2], s = cs[p.slot[i]], ao = p.ao[i] / 255;
      const nx = p.N[i * 3] / 32767, ny = p.N[i * 3 + 1] / 32767, nz = p.N[i * 3 + 2] / 32767; N[j * 3] = nx; N[j * 3 + 1] = ny; N[j * 3 + 2] = nz;
      col.copy(s.c); cls[j] = s.k; TU[j * 4 + 2] = TU[j * 4 + 3] = 1;   // (off the face's paint: its plain corner)
      if (s.a === 'cloth' || s.a === 'leather') { TU[j * 4 + 2] = p.seam ? p.seam[i * 2] : .5; TU[j * 4 + 3] = p.seam ? p.seam[i * 2 + 1] : 0; }   // (where it is on the picture of seams)
      if (s.camo) {   // camouflage: a second and a third colour brushed on in blotches
        const n1 = lumps(x * 13 + 3.1, y * 9 + 1.7, z * 13 + 5.3) + .35 * lumps(x * 37, y * 31, z * 37); col.lerp(s.camo[0], ss(.1, .26, n1));
        if (s.camo[1]) { const n2 = lumps(x * 17 - 4.2, y * 12 + 8.1, z * 17 + 2.6) + .35 * lumps(x * 41 + 9, y * 35, z * 41); col.lerp(s.camo[1], ss(.2, .36, n2)); }
      }
      if (s.a === 'cloth') { col.multiplyScalar(.94 + .09 * lumps(x * 9, y * 9, z * 9)); const mud = (1 - ss(0, .55, y)) * (.35 + .3 * lumps(x * 6, y * 4, z * 6)); if (mud > 0) col.lerp(dirt, Math.min(.5, mud)); }
      else if (s.a === 'leather') { col.multiplyScalar(.95 + .1 * lumps(x * 14, y * 14, z * 14)); const mud = (1 - ss(0, .12, y)) * .25; if (mud > 0) col.lerp(dirt, mud); }
      else if (s.a === 'skin' && p === headP) {
        const hy = y - HC[1], hz = z - HC[2], name = p.slots[p.slot[i]], face = name === 'lips' || name === 'lash';
        if (face) col.copy(skinC);   // lips and the lids' edges are in the face's paint (human-paint.js, with the brows), whatever the points were sculpted as
        const red = bump(hy, -.03, .024) * bump(abs(x), .04, .024) * ss(.0, .05, hz) * .045 + bump(hy, -.034, .012) * bump(x, 0, .012) * .07 + ss(.07, .078, abs(x)) * .1;   // cheeks, nose, ears
        col.r *= 1 + red * .35; col.g *= 1 - red * .5; col.b *= 1 - red * .55;
        // the shadow of a beard under the skin, cool and grey: the upper lip, the chin and under it, the jaw, and up the cheek to the sideburn
        // by the ear (a beard's line runs from the corner of the mouth up across the cheek). It shows at a few paces, where the dots don't
        if (stub && name !== 'brow') { const top = -.042 + .045 * ss(.035, .07, abs(x)), sh = ss(top, top - .016, hy) * ss(-.045, -.01, hz) * ss(-.165, -.125, hy) * stub; col.r *= 1 - sh * .38; col.g *= 1 - sh * .33; col.b *= 1 - sh * .24; }
        col.multiplyScalar(.975 + .035 * lumps(x * 55, y * 55, z * 55) + .02 * lumps(x * 190, y * 190, z * 190));   // skin is never one flat colour
        const ES = esOf(sp.face), so = bump(hy, .004 * ES, .014 * ES) * bump(abs(x), EYE[0], .017 * ES) * (hz > .05 ? .07 : 0); col.multiplyScalar(1 - so);   // the eye sockets a little darker
        faceUV(x, y, z, uv1, sp.face.real ? FACE_REAL : FACE); TU[j * 4 + 2] = uv1[0]; TU[j * 4 + 3] = uv1[1];   // where it is on the face's paint
      }
      // a man's short back and sides: clipped close over the ears and at the nape, the skin showing through, so lighter there than on top
      // (and never one flat colour). One dark block down to the hairline read as a cap of paint
      if (s.k === HAIRK && p === headP && !sp.fem) { const hy = y - HC[1], clip = ss(.035, -.03, hy) * (.3 + .1 * ss(-.02, -.06, z - HC[2])); col.lerp(skinC, clip); col.multiplyScalar(.94 + .08 * lumps(x * 60, y * 60, z * 60)); }
      // the iris: fine streaks out from the pupil (each sliver of it a little lighter or darker than the next)
      if (s.a === 'eyes' && p === headP && !sp.face.real) { const b = +p.slots[p.slot[i]][3]; if (b >= 1 && b <= 3) col.multiplyScalar(1 + .14 * lumps(Math.round(Math.atan2(y - HC[1] - EYE[1], abs(x) - EYE[0]) / (PI * 2) * 24) * 7.31 + (x > 0 ? 3 : 11), b * .37, 2.9)); }
      // creases in soft shadow (warmer on skin: light soaks through it). On a face only what is tight stays dark (a nostril, the folds of an
      // ear, under the jaw): the broad soft shadow of an ear or of hair beside a cheek lay on it like a smudge
      const k = s.a === 'eyes' ? ao : .28 + .72 * (s.a === 'skin' && p === headP ? ao + (1 - ao) * .65 * ss(.35, .75, ao) : ao);
      if (s.a === 'skin') { C[j * 3] = col.r * Math.pow(k, .75); C[j * 3 + 1] = col.g * k; C[j * 3 + 2] = col.b * Math.pow(k, 1.15); } else { C[j * 3] = col.r * k; C[j * 3 + 1] = col.g * k; C[j * 3 + 2] = col.b * k; }
      // the grain of cloth, leather and skin laid on by the way each point faces (metres)
      const lk = LAY[i], sc = TILES(s.k); U[j * 2] = (lk === 1 ? z : x) * sc; U[j * 2 + 1] = (lk ? y : z) * sc;
      // (hair: its strands are laid round the head from the crown, so they run out from it on top and down the sides and the back, the same either side)
      if (s.k === HAIRK && p === headP) { U[j * 2] = Math.atan2(abs(x), z - HC[2] + .0125) / PI * HAIR.round / 2; U[j * 2 + 1] = y * 16; }
      // (a real face's eyes: where each point is on the iris's picture, seen from in front, each eye's turned its own way; the white, and the
      // pink in the corner, on the plain ring round it)
      if (s.k === EYESK && sp.face.real && p === headP) {
        const ri = .0122 * esOf(sp.face) * Math.sin(27.5 * PI / 180) / IRIS.edge, lx = (abs(x) - EYE[0]) / ri, ly = (y - HC[1] - EYE[1]) / ri, an = (sp.face.aseed || 0) * 2.1 + (x > 0 ? 0 : 2.4), ca = Math.cos(an), sa = Math.sin(an);
        let u = ca * lx - sa * ly, v = sa * lx + ca * ly; const rr = Math.hypot(u, v), out = z - HC[2] < EYE[2] + .0122 * esOf(sp.face) * Math.cos(27.6 * PI / 180) || rr > IRIS.edge;
        if (out) { const k = 1.01 / Math.max(1e-6, rr); u *= k; v *= k; if (!(rr > 0)) u = 1.01; }
        U[j * 2] = .5 + .5 * u; U[j * 2 + 1] = .5 + .5 * v;
      }
      const ws = p.SW[i * 4] + p.SW[i * 4 + 1] + p.SW[i * 4 + 2] + p.SW[i * 4 + 3] || 1;
      for (let q = 0; q < 4; q++) { SI[j * 4 + q] = bi[p.SI[i * 4 + q]]; SW[j * 4 + q] = p.SW[i * 4 + q] / ws; }
    }
    // the twins: the same points again, their grain laid on another way or at another size (seams(), above)
    for (let t = 0, j = at + p.n; t < sm.n; t++, j++) {
      const v = at + sm.src[t], lk = sm.way[t], sc = sm.size[t], x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      P[j * 3] = x; P[j * 3 + 1] = y; P[j * 3 + 2] = z; N[j * 3] = N[v * 3]; N[j * 3 + 1] = N[v * 3 + 1]; N[j * 3 + 2] = N[v * 3 + 2]; C[j * 3] = C[v * 3]; C[j * 3 + 1] = C[v * 3 + 1]; C[j * 3 + 2] = C[v * 3 + 2];
      U[j * 2] = (lk === 1 ? z : x) * sc; U[j * 2 + 1] = (lk ? y : z) * sc; cls[j] = cls[v]; for (let q = 0; q < 4; q++) TU[j * 4 + q] = TU[v * 4 + q];
      for (let q = 0; q < 4; q++) { SI[j * 4 + q] = SI[v * 4 + q]; SW[j * 4 + q] = SW[v * 4 + q]; }
    }
    at += p.n + sm.n;
  }
  // (gsThin and uv1 share one list: WebGPU takes eight lists a mesh at most, and these would have been the seventh and the eighth)
  const tu = new InterleavedBuffer(TU, 4);
  const attrs = { position: new BufferAttribute(P, 3), normal: new BufferAttribute(N, 3), color: new BufferAttribute(C, 3), uv: new BufferAttribute(U, 2), skinIndex: new BufferAttribute(SI, 4), skinWeight: new BufferAttribute(SW, 4), gsThin: new InterleavedBufferAttribute(tu, 2, 0), uv1: new InterleavedBufferAttribute(tu, 2, 2) };
  // each level: its triangles in groups by material (close: all six; middle: skin and the rest; far: one)
  const matsFor = [[skin, sp.face.real ? M.eyesReal : M.eyes, M.cloth, M.leather, M.hard, M.steel, sp.face.real ? M.hairReal : M.hair, M.lash], [skin, M.far], [M.far]], groupOf = [k => k, k => k <= 1 ? 0 : 1, () => 0];
  const geos = [0, 1, 2].map(L => {
    const by = matsFor[L].map(() => []);
    pieces.forEach((p, pi) => { const I = L ? p.I[L] : seam[pi].I, off = offs[pi]; for (let t = 0; t < I.length; t += 3) { const a = I[t] + off, b = I[t + 1] + off, c = I[t + 2] + off, k = cls[b] === cls[c] ? cls[b] : cls[a]; by[groupOf[L](k)].push(a, b, c); } });
    const g = new BufferGeometry(); for (const k in attrs) g.setAttribute(k, attrs[k]);
    const all = new Uint32Array(by.reduce((a, l) => a + l.length, 0)); let s = 0; by.forEach((l, i) => { all.set(l, s); if (l.length) g.addGroup(s, l.length, i); s += l.length; });
    g.setIndex(new BufferAttribute(n > 65535 ? all : new Uint16Array(all), 1));
    g.boundingSphere = new Sphere(new Vector3(0, .95, 0), 1.3); return g;
  });
  slimShared(geos);   // (normals, colours and bone weights in fewer bytes: slim.js; gsThin and uv1 share one list and stay as floats)

  // ---- hair in strands (fur.js): layers of them over the sculpted hair, streaming from the crown of the head (from the
  // bun, for hair tied back), a moustache of them and a beard on the jaw; close up only. The layers are made in stand()
  // (the hair of the head is a clean sculpted shape by itself: it wears strands too only when asked, strands: true or { ... })
  const so = o.strands === false ? null : typeof o.strands === 'object' && o.strands ? o.strands : {}, onHead = !!o.strands && !!sp.hair && sp.hairStyle !== 'bald'; let hairGeo = null;
  if (so && headP && (so.layers ?? fur.layers()) > 0 && (onHead || sp.beard || sp.moustache)) {
    const off = offs[pieces.indexOf(headP)], grow = new Float32Array(n), HAIR = CLASSES.indexOf('hair'), hc = new Color(pal.hair), fl = sp.face.lips, sf = sp.face.soft, real = !!sp.face.real;
    // (under a hat the hair stays as it is sculpted, cropped close: there is little of it to see)
    const long = sp.hat ? 0 : sp.hairStyle === 'long' ? 1.5 : sp.hairStyle === 'bun' ? .75 : 1; let cols = null, cover = null;
    for (let i = 0; i < headP.n; i++) {
      const j = off + i, name = headP.slots[headP.slot[i]];
      if (cls[j] === HAIR) { if (onHead) grow[j] = long; continue; }
      const x = headP.P[i * 3], hy = headP.P[i * 3 + 1] - HC[1], hz = headP.P[i * 3 + 2] - HC[2];
      if (name === 'brow') { if (hy < 0) grow[j] = .45; continue; }   // (a moustache; the brows stay painted)
      if (!(real ? sp.beard || sp.moustache : sp.beard) || (name !== 'skin' && name !== 'lips')) continue;
      // a beard: where stubble is painted (the jaw, the chin, the upper lip, under the chin), but not on the lips
      const lip = Math.min(Math.hypot(x / (.0228 - .0035 * sf), (hy - MOUTH.y - .005) / (.0048 * fl)), Math.hypot(x / (.0195 - .002 * sf), (hy - MOUTH.y + .0058) / (.0062 * fl)));
      if (real) {
        // a real face's: its edges where a real beard's are, each a little ragged (more and fewer strands, not a line). The cheek line runs from
        // beside the nose down past the corner of the mouth and up across the cheek to the sideburn by the ear; the neckline from under the
        // jaw's corner to the throat, a finger above the Adam's apple (in side view a line from 4 cm behind the head's middle and 8.5 cm down
        // to 3.5 cm in front and 13 cm down); none behind the front of the ear. A moustache by itself: the upper lip, its ends past the corners
        const ax = abs(x), e = .003 * lumps(x * 260, hy * 260 + 3.1, hz * 260) + .0013 * lumps(x * 800 + 5.3, hy * 800, hz * 800 + 1.7);
        const top = -.0485 - .0055 * ss(.012, .03, ax) + .034 * ss(.035, .075, ax) + .014 * ss(.068, .078, ax) + e, dn = ((hz + .04) * .045 + (hy + .085) * .075) / .0875 + .6 * e;
        // (over the upper lip a moustache comes down to the lip's edge, over the groove in the middle too)
        const ang = Math.atan2(ax, hz) * 180 / PI, back = 80 + 8 * ss(-.045, -.075, hy), lipOff = hy > MOUTH.y ? ss(1, 1.2, lip) : ss(1.25, 2, lip);
        const kb = sp.beard ? ss(top, top - .012, hy) * ss(-.002, .006, dn) * ss(back, back - 8, ang) * lipOff : 0;
        const km = sp.moustache ? ss(top, top - .004, hy) * ss(.031, .024, ax - .2 * e) * ss(MOUTH.y - .005, MOUTH.y + .002, hy) * lipOff : 0;
        const k = Math.max(kb, km); if (k <= .02) continue;
        grow[j] = Math.max(kb * sp.beard * 1.7 * (.45 + .55 * kb), km * Math.max(1.15, (sp.beard || 0) * 1.7) * (.5 + .5 * km));
        (cover ||= new Float32Array(n).fill(1))[j] = Math.pow(k, .7);
        cols ||= C.slice(); const a = (.28 + .72 * headP.ao[i] / 255) * (.75 + .25 * k); cols[j * 3] = hc.r * a; cols[j * 3 + 1] = hc.g * a; cols[j * 3 + 2] = hc.b * a;
        continue;
      }
      const k = ss(-.04, -.062, hy) * ss(-.03, .01, hz) * ss(-.165, -.12, hy) * ss(1.25, 2, lip);
      if (k > .02) { grow[j] = k * sp.beard * 1.7; cols ||= C.slice(); const a = (.28 + .72 * headP.ao[i] / 255) * (.75 + .25 * k); cols[j * 3] = hc.r * a; cols[j * 3 + 1] = hc.g * a; cols[j * 3 + 2] = hc.b * a; }
    }
    // (a real face's hairline: the strands thin out over its last centimetre or so, shorter and fewer and raggedly, not ending in a cliff at
    // the edge of a triangle; rings of points in from the edge of the hair)
    if (real && onHead) {
      const I1 = headP.I[so.from ?? 1], ring = new Uint8Array(n).fill(255);
      for (let t = 0; t < I1.length; t += 3) { const v = [I1[t] + off, I1[t + 1] + off, I1[t + 2] + off], h = v.map(q => cls[q] === HAIR); if (h.some(Boolean) && !h.every(Boolean)) v.forEach((q, i) => { if (h[i]) ring[q] = 0; }); }
      for (let r = 0; r < 2; r++) for (let t = 0; t < I1.length; t += 3) { const v = [I1[t] + off, I1[t + 1] + off, I1[t + 2] + off]; if (v.some(q => ring[q] === r)) v.forEach(q => { if (cls[q] === HAIR && ring[q] > r + 1) ring[q] = r + 1; }); }
      for (let i = 0; i < headP.n; i++) {
        const j = off + i; if (ring[j] > 2) continue;
        const f = Math.max(.08, Math.min(1, [.3, .62, .86][ring[j]] * (1 + .35 * lumps(headP.P[i * 3] * 300, headP.P[i * 3 + 1] * 300, headP.P[i * 3 + 2] * 300))));
        grow[j] *= f; (cover ||= new Float32Array(n).fill(1))[j] = f;
      }
    }
    // the hair on the middle level's triangles (strands hide what a finer surface under them would add); a beard and a
    // moustache on the finest (the face under them is the finest, and would show through a coarser coat)
    const idx = [], hairy = j => cls[j] === HAIR;
    for (const [I, face] of [[headP.I[so.from ?? 1], false], [headP.I[0], true]]) for (let t = 0; t < I.length; t += 3) {
      const a = I[t] + off, b = I[t + 1] + off, c = I[t + 2] + off, onHair = hairy(a) || hairy(b) || hairy(c);
      if (face ? !onHair && grow[a] + grow[b] + grow[c] > 0 : onHair && onHead) idx.push(a, b, c);
    }
    hairGeo = fur.shell(geos[0], {
      index: idx, where: grow, colors: cols, cover, length: so.length ?? .012, tile: so.tile ?? .06, thin: 0, ease: .25,
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
      const p = pieces[pi], off = offs[pi], a = atOf(gearBones[name]), G = geos[0].attributes, lp = floatsOf(G.position, off, p.n), count = new Array(CLASSES.length).fill(0);
      for (let i = 0; i < p.n; i++) { lp[i * 3] -= a[0]; lp[i * 3 + 1] -= a[1]; lp[i * 3 + 2] -= a[2]; count[cls[off + i]]++; }
      g = looseGeo[name] = new BufferGeometry();
      // (read back from the person's own lists, which are kept small, slim.js: the plain lists they were made from are let go)
      g.setAttribute('position', new BufferAttribute(lp, 3)); g.setAttribute('normal', new BufferAttribute(floatsOf(G.normal, off, p.n), 3));
      g.setAttribute('color', new BufferAttribute(floatsOf(G.color, off, p.n), 3)); g.setAttribute('uv', new BufferAttribute(floatsOf(G.uv, off, p.n), 2)); g.setAttribute('gsThin', new BufferAttribute(new Float32Array(p.n * 2), 2));
      g.setAttribute('uv1', new BufferAttribute(floatsOf(G.uv1, off, p.n), 2));   // (where it is on the picture of seams: a pouch that comes loose keeps its stitching)
      g.setIndex(new BufferAttribute(p.I[1], 1)); g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new Vector3()); g.translate(-c.x, -c.y, -c.z); g.computeBoundingSphere();
      g.userData = { at: [c.x, c.y, c.z], mat: M[CLASSES[count.indexOf(Math.max(...count))]] || M.far };
    }
    const m = new Mesh(g, g.userData.mat); m.castShadow = sh; m.userData.at = g.userData.at; m.name = 'human:' + name;
    return m;
  };

  const sh = o.shadows !== false, scale = (o.scale ?? 1) * (sp.fem ? .945 : 1), tris = geos.map(g => g.index.count / 3);
  const wetGeo = headP && sp.face.real ? wetOf(sp.face, bones) : null;
  const stand = () => {
    const B = tree(), root = new Group();
    root.add(B.hips); B.armL.rotation.z = ARM; B.armR.rotation.z = -ARM; root.updateMatrixWorld(true);   // bound with the arms out, as sculpted
    const skel = new Skeleton(bones.map(b => B[b]));
    B.armL.rotation.z = B.armR.rotation.z = 0; root.updateMatrixWorld(true);
    // Further off (the middle and far levels) nobody can see a finger bend, a toe or the turn of a forearm: there each of
    // those small bones stands in as the one it hangs from (the same skin, no other set of weights), is not worked
    // out at all, and is left out of the scene while the person is at those levels. A squad far off then costs about
    // what it did on fifteen bones (thirty people, posing and bones in JavaScript each frame, on a desktop core: .17 ms
    // on fifteen bones, .47 ms on these close up, .2 ms further off; hundreds are a crowd's work: gs.props.Crowd).
    const whole = bones.map((b, i) => { let k = b; while (FINE.test(k)) k = parent[k]; return k === b ? -1 : bones.indexOf(k); }), small = bones.filter((b, i) => whole[i] >= 0).map(b => B[b]);
    const holds = b => { for (const c of b.children) if (!c.isBone || holds(c)) return true; return false; };
    const far = new Skeleton(bones.map((b, i) => B[whole[i] < 0 ? b : bones[whole[i]]]), bones.map((b, i) => skel.boneInverses[whole[i] < 0 ? i : whole[i]]));
    far.update = function () {
      const M = this.boneMatrices, inv = this.boneInverses, bs = this.bones;
      for (let i = 0; i < bs.length; i++) { const w = whole[i]; if (w < 0) _m4.multiplyMatrices(bs[i].matrixWorld, inv[i]).toArray(M, i * 16); else M.copyWithin(i * 16, w * 16, w * 16 + 16); }
      if (this.boneTexture !== null) this.boneTexture.needsUpdate = true;
    };
    const lods = geos.map((g, L) => { const m = new SkinnedMesh(g, matsFor[L]); m.castShadow = m.receiveShadow = sh; m.name = 'human' + L; m.frustumCulled = true; m.boundingSphere = new Sphere(new Vector3(0, .95, 0), 1.7); root.add(m); m.bind(L ? far : skel, new Matrix4()); m.visible = L === 0; return m; });
    // (a real face's wet eyes: their own see-through mesh on the same bones, close up only)
    const wet = wetGeo ? new SkinnedMesh(wetGeo, M.wet) : null;
    if (wet) { wet.name = 'human:wet'; wet.castShadow = wet.receiveShadow = false; wet.userData.noAO = true; wet.frustumCulled = true; wet.boundingSphere = new Sphere(new Vector3(0, .95, 0), 1.7); root.add(wet); wet.bind(skel, new Matrix4()); }
    root.scale.setScalar(scale);
    root.name = 'human'; root.mesh = lods[0]; root.lods = lods; root.bones = B; root.wet = wet;
    root.rig = rigOf(B, scale, root);
    for (const [name, how] of hung) root.rig.hang(B[name], how);   // a pack, a bag, a canteen, a holster: they bounce and swing as he moves (close up)
    root.face = root.rig.face = new LiveFace(root, B, { lid: headP?.lid });   // blinks, eyes, brows and mouth: the rig steps it with the body
    let cur = 0;
    Object.defineProperty(root, 'lod', { get: () => cur, set(v) {
      v = Math.max(0, Math.min(2, v | 0)); if (v === cur) return;
      lods[cur].visible = false; lods[v].visible = true; if (wet) wet.visible = !v;
      if (!v !== !cur) {
        for (const bone of small) { const kids = bone.parent.children, i = kids.indexOf(bone); if (v) { if (i >= 0) kids.splice(i, 1); } else if (i < 0) kids.push(bone); }   // (the small bones: in the scene only close up)
        if (small.some(holds)) sceneEdited(root);   // (something a game hung on a finger or the jaw: the scene's list has to know it went or came back)
      }
      cur = v; root.rig.fine = !v; root.rig.near = v < 2;   // (and the rig leaves the forearm's turn and the toes alone meanwhile; at the far level it leaves the feet as posed too)
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
      for (const [sd, pt] of arms) closeOnThing(sd, thing, pt);   // (and the fingers round it)
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
     * level: 0..1 how flat each foot is held to the floor he stands on (a number, or { L, R }); round: the radius
     * of the bar or rung a hand closes round, its point the bar's middle (metres, a number or { L, R }; hands: 'grip'
     * close round 1.6 cm by themselves, 0 lays a hand open on it). After rig.update().
     */
    root.touch = (pts, { blend = 1, elbows = {}, knees = {}, palms = {}, level = 0, round = HAND.grip ? .016 : 0 } = {}) => {
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
        const rr = hand ? (typeof round === 'number' ? round : round[sd] ?? 0) : 0;
        if (rr > 0) { root.updateMatrixWorld(true); closeRound(sd, tgt, rr, k); }   // (the fingers round the bar, as far as the hand has been carried there)
      }
      root.rig.fill();
      return root;
    };
    // the fingers: each joint's bone, the way it bends, and how far it is bent as sculpted
    const FB = {}; for (const sd of ['L', 'R']) FB[sd] = ['thumb', 'index', 'middle', 'ring', 'little'].map(f => [1, 2, 3].map(j => B[f + j + sd]).filter(Boolean));
    // each finger's tip from its last joint, in that joint's own space (as sculpted: the other hand's in a mirror)
    const TIP = {}; for (const sd of ['L', 'R']) TIP[sd] = ['thumb', 'index', 'middle', 'ring', 'little'].map(f => { const J = HAND[f], a = J[J.length - 2], b = J[J.length - 1]; return new Vector3((b[0] - a[0]) * (sd === 'L' ? 1 : -1), b[1] - a[1], b[2] - a[2]); });
    const CURL = [1.5, 1.75, 1.1], THUMB = [.55, .85], was = HAND.grip ? .8 : .2;
    // one finger bent to k (0 flat, 1 a fist; null as sculpted)
    // one finger bent to k (0 flat, 1 a fist; null as sculpted), its last joint w further (a finger wrapped round something thick)
    const bend = (sd, f, k, w = 0) => {
      const m = sd === 'L' ? 1 : -1, list = FB[sd][f], last = list.length - 1;
      list.forEach((bone, j) => {
        const q = j === last ? k + w : k;
        if (k == null) bone.quaternion.identity();
        else if (f === 0) bone.quaternion.setFromAxisAngle(ax.set(HAND.turn[0], m * HAND.turn[1], m * HAND.turn[2]), (q - was) * THUMB[j]);   // (the other hand: the same turn in a mirror)
        else bone.rotation.set(0, 0, -m * (CURL[j] * q - HAND.bend[j]));
      });
    };
    // ---- hands that hold: a hand left to the engine (every hand, until a game sets its fingers itself) closes its fingers round what it
    // holds, each until it meets it (hold(): the thing's own shape; touch() with round: a bar), lies relaxed when it holds nothing, a
    // little more closed at a run, and eases from one to the other. Close up only (rig.fine), like the other small bones.
    // a hand hanging at rest: the thumb and the index straightest, each finger after a little more curled. A hand sculpted closed (hands: 'grip')
    // opens no further than OPEN: its fingertips are sculpted against the palm, and opened further the skin between them draws out into a thread
    const OPEN = HAND.grip ? .3 : 0, RELAX = HAND.grip ? [.55, .3, .33, .38, .44] : [.16, .2, .28, .35, .42];
    const five = () => [0, 0, 0, 0, 0], auto = { L: true, R: true }, curl = { L: RELAX.slice(), R: RELAX.slice() }, wrap = { L: five(), R: five() }, gripped = { L: -9, R: -9 };
    const want = { L: five(), R: five() }, wantW = { L: five(), R: five() }, touched = { L: five(), R: five() }, touchedW = { L: five(), R: five() };   // (what the last grip asked for, and where each finger met it)
    let frame = 0;
    for (const sd of ['L', 'R']) curl[sd].forEach((k, f) => bend(sd, f, k));
    root.rig.hands = { step(dt, speed = 0) {
      frame++; const run = .22 * ss(2.2, 5, Math.abs(speed));
      for (const sd of ['L', 'R']) {
        if (!auto[sd]) continue;
        const held = gripped[sd] >= frame - 2, c = curl[sd], w = wrap[sd], ease = (a, to) => a + (to - a) * (1 - Math.exp(-dt * (to > a ? 14 : 7)));   // (closing quicker than letting go)
        for (let f = 0; f < 5; f++) { c[f] = ease(c[f], held ? want[sd][f] : RELAX[f] + run * (f ? 1 : .4)); w[f] = ease(w[f], held ? wantW[sd][f] : 0); bend(sd, f, c[f], w[f]); }
      }
    } };
    // the distance from the segment p..q to the line through a along the unit direction d
    const lineGap = (p, q, a, d) => {
      const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z, wx = p.x - a.x, wy = p.y - a.y, wz = p.z - a.z, uu = ux * ux + uy * uy + uz * uz, ud = ux * d.x + uy * d.y + uz * d.z, uw = ux * wx + uy * wy + uz * wz, dw = d.x * wx + d.y * wy + d.z * wz, den = uu - ud * ud;
      const t = den > 1e-12 ? Math.max(0, Math.min(1, (ud * dw - uw) / den)) : 0, s2 = ud * t + dw, ex = wx + ux * t - d.x * s2, ey = wy + uy * t - d.y * s2, ez = wz + uz * t - d.z * s2;
      return Math.sqrt(ex * ex + ey * ey + ez * ez);
    };
    const fa = new Vector3(), fb = new Vector3(), fc = new Vector3(), axis = new Vector3();
    /**
     * Kit use: closes a hand's fingers round a bar through `at` (world) of radius r, across the palm (the way the fingers fold): each
     * finger is bent until its last two lengths meet the bar's surface, and then, if the tip still stands off it (a thick bar), its last
     * joint further until the tip meets it too; the thumb the same. k: how far the hand has been carried there.
     */
    const closeRound = (sd, at, r, k = 1) => {
      if (!auto[sd]) return;
      const t = .0085 * HAND.k * root.scale.y, out = want[sd], outW = wantW[sd], met = touched[sd], metW = touchedW[sd], warm = gripped[sd] >= frame - 2, hand = B['hand' + sd];
      axis.set(0, 0, 1).transformDirection(hand.matrixWorld);   // (the fingers fold about the hand's own z)
      for (let f = 0; f < 5; f++) {
        const list = FB[sd][f], mid = list[list.length - 2], end = list[list.length - 1];
        const meets = (q, w = 0, tip = false) => { bend(sd, f, q, w); list[0].updateMatrixWorld(true); mid.getWorldPosition(fa); end.getWorldPosition(fb); fc.copy(TIP[sd][f]).multiplyScalar(.85); end.localToWorld(fc); return (tip ? lineGap(fb, fc, at, axis) : Math.min(lineGap(fa, fb, at, axis), lineGap(fb, fc, at, axis))) < r + t; };
        // (held last frame too: close to where it met it then, a few looks; else in steps from flat to a fist for the first that meets it;
        // then finer between that and the step before)
        let lo = -.1, hi = 1.15, n = 5, found = true;
        if (warm && !meets(met[f] - .06) && meets(met[f] + .06)) { lo = met[f] - .06; hi = met[f] + .06; n = 3; }
        else { for (let q = 0; q <= 1.15; q += .15) { if (meets(q)) { hi = q; break; } lo = q; } if (hi >= 1.15 && !meets(hi)) { n = 0; found = false; } }
        for (let i = 0; i < n; i++) { const m = (lo + hi) / 2; if (meets(m)) hi = m; else lo = m; }
        met[f] = lo;
        // the last joint on round the bar until the tip meets it too (nothing more if it already does, or never would)
        const k0 = Math.max(OPEN, lo); let wl = 0, wh = 1.2, wn = 4;
        if (!found || meets(k0, 0, true)) wn = 0;
        else if (warm && metW[f] > 0 && !meets(k0, metW[f] - .08, true) && meets(k0, metW[f] + .08, true)) { wl = metW[f] - .08; wh = metW[f] + .08; wn = 3; }
        else { for (let w = .2; w < 1.3; w += .2) { if (meets(k0, w, true)) { wh = w; break; } wl = w; } if (wh >= 1.2 && !meets(k0, wh, true)) { wl = 0; wn = 0; } }
        for (let i = 0; i < wn; i++) { const m = (wl + wh) / 2; if (meets(k0, m, true)) wh = m; else wl = m; }
        metW[f] = wl; out[f] = RELAX[f] + (k0 - RELAX[f]) * k; outW[f] = wl * k;
        bend(sd, f, curl[sd][f], wrap[sd][f]); list[0].updateMatrixWorld(true);
      }
      gripped[sd] = frame;
    };
    // round what hold() puts a hand on: how thick the thing is through the palm, read by two rays at the thing's own triangles (once for a
    // hold, and again if the hand comes round it another way)
    const ray = new Raycaster(), hits = [], seen = { L: null, R: null }, pn = new Vector3(), pp = new Vector3(), pc = new Vector3(), _q = new Quaternion();
    const closeOnThing = (sd, thing, pt) => {
      if (!auto[sd] || root.rig.fine === false) return;
      const hand = B['hand' + sd]; palm[sd].getWorldPosition(pp); pn.set(sd === 'L' ? -1 : 1, 0, 0).transformDirection(hand.matrixWorld);   // (the way the palm faces)
      let s0 = seen[sd]; const local = pn.clone().transformDirection(_m4.copy(thing.matrixWorld).invert());
      if (!s0 || s0.thing !== thing || s0.pt[0] !== pt[0] || s0.pt[1] !== pt[1] || s0.pt[2] !== pt[2] || s0.n.dot(local) < .9) {
        const sc = root.scale.y, side = (from, dir) => { ray.set(from, dir); ray.far = .2 * sc; hits.length = 0; ray.intersectObject(thing, true, hits); return hits.length ? hits[0].point.clone() : null; };
        const far = side(fa.copy(pp).addScaledVector(pn, .1 * sc), fb.copy(pn).negate()), near = side(fa.copy(pp).addScaledVector(pn, -.1 * sc), pn);
        let c, r;
        if (far && near && far.distanceTo(near) > .006 * sc) { c = near.add(far).multiplyScalar(.5); r = Math.min(.06 * sc, far.distanceTo(c)); }
        else { r = .02 * sc; c = pp.clone().addScaledVector(pn, r); }   // (nothing found: a bar of an ordinary grip's size)
        seen[sd] = s0 = { thing, pt: pt.slice(), n: local, c: thing.worldToLocal(c), r: r / thing.getWorldScale(pc).x };
      }
      closeRound(sd, pc.copy(s0.c).applyMatrix4(thing.matrixWorld), s0.r * thing.getWorldScale(fc).x);
    };
    /**
     * How far each hand's fingers are closed: fingers({ L: .5, R: 1 }): 0 flat, 1 a fist, null as sculpted (a little
     * curled; with hands: 'grip', closed round a stock). A number for the whole hand, or one a finger:
     * [thumb, index, middle, ring, little]. They stay as set until set again (poses leave fingers alone); 'auto'
     * gives a hand back to the engine, which closes it round what it holds and lets it lie relaxed otherwise.
     */
    root.fingers = (o = {}) => {
      for (const sd of ['L', 'R']) {
        if (!(sd in o)) continue; const v = o[sd];
        auto[sd] = v === 'auto'; if (auto[sd]) continue;
        for (let f = 0; f < 5; f++) { const c = v == null ? null : typeof v === 'number' ? v : v[f] ?? null; bend(sd, f, c == null ? null : Math.max(-.2, Math.min(1.2, c))); }
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
/** The look people are made in when they don't say: 'clean' (as made, a simpler, friendlier face) or 'real' (see human()'s look). */
human.clear = async () => { made.clear(); const db = await open(); if (db) await tx(db, 'readwrite', (s, w) => { s.clear(); w.clear(); }); };
