// gs.models.creature(options): an animal or a monster made in code from a seed: four-legged animals,
// birds, fish, insects and monsters. Built on the people builder: soft shapes melted into one surface
// (field.js; the shapes and the choosing are creature-shapes.js), with creases in soft shadow, eyes that
// catch the light, a coat painted by where each point is (a paler belly, spots, stripes, patches, socks),
// one skinned mesh on a skeleton of its own in three levels of detail, and gaits made for its own legs
// and wings (creature-moves.js) on gs.poses' Rig, so it walks, trots, gallops, flies or swims in step
// with the ground.
// Sculpting takes a few tenths of a second for a new shape, so it happens in a background worker while
// the app shows "Loading…" (make creatures in make() or reset()), and each shape is saved on the phone.
// Creatures of the same shape share it whatever their colours and size; twin() is another for free.
// Kit use only: games reach it as gs.models.creature.
import { Bone, BufferAttribute, BufferGeometry, Color, Group, Matrix4, Skeleton, SkinnedMesh, Sphere, Vector3 } from 'three';
import { lumps } from './field.js';
import { ss } from './human-shapes.js';
import { planOf, build, sculpt, VERSION, hashOf, CREATURE_KINDS, CREATURE_LIKES } from './creature-shapes.js';
import { movesFor } from './creature-moves.js';
import { runCreature, canRunCreature } from '../jobs.js';
import { Rig } from '../poses.js';
import { pbr, HD } from '../hd3d.js';
import { StillLoading } from '../lazy.js';
import { fur } from './fur.js';

const PI = Math.PI, abs = Math.abs;

// ================================================================= sculpts: in memory, saved, or made in a worker
const made = new Map(), loading = new Map(), built = new Map();   // key -> { p, t }; key -> a promise for it; key -> build(plan)
const DB = 'gs-creatures', KEEP = 60, HELD = 48, clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
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
const good = p => p && p.n > 0 && p.P?.length === p.n * 3 && p.I?.length === 3 && Array.isArray(p.slots) && Array.isArray(p.names);
async function saved(key) {
  const db = await open(); if (!db) return null;
  const id = idOf(key), p = await tx(db, 'readonly', s => s.get(id)); if (!good(p)) return null;
  tx(db, 'readwrite', (s, w) => w.put(Date.now(), id));   // used just now: the last to be thrown away
  return p;
}
async function save(key, p) {
  const db = await open(); if (!db) return;
  const id = idOf(key); await tx(db, 'readwrite', (s, w) => { s.put(p, id); w.put(Date.now(), id); });
  const keys = await tx(db, 'readonly', (s, w) => w.getAllKeys()), times = await tx(db, 'readonly', (s, w) => w.getAll());   // the newest KEEP stay
  if (keys && times && keys.length > KEEP) { const old = keys.map((k, i) => [k, times[i]]).sort((a, b) => a[1] - b[1]).slice(0, keys.length - KEEP); tx(db, 'readwrite', (s, w) => { for (const [k] of old) { s.delete(k); w.delete(k); } }); }
}
const job = plan => ({ gen: plan.gen, p: plan.p, detail: plan.detail });
const here = plan => new Promise((res, rej) => setTimeout(() => { try { res(sculpt(job(plan))); } catch (e) { rej(e); } }, 0));
const hold = (key, p) => { made.set(key, { p, t: clock() }); return p; };
/** A promise for a plan's sculpt: from memory, the saved copy, or sculpted now (in a worker where there is one). */
function load(plan) {
  const have = made.get(plan.key); if (have) return Promise.resolve(have.p);
  let pr = loading.get(plan.key);
  if (!pr) {
    pr = (async () => {
      let p = await saved(plan.key);
      if (!p) { p = canRunCreature() ? await runCreature(job(plan)).catch(() => here(plan)) : await here(plan); save(plan.key, p); }
      return hold(plan.key, p);
    })().finally(() => loading.delete(plan.key));
    loading.set(plan.key, pr);
  }
  return pr;
}
// the HELD sculpts used last stay in memory (the rest have their saved copies)
function tidy() { if (made.size <= HELD) return; for (const [k] of [...made].sort((a, b) => a[1].t - b[1].t).slice(0, made.size - HELD)) { made.delete(k); built.delete(k); } }
const missing = list => { const out = new Map(); for (const o of list) { const pl = planOf(o); if (!made.has(pl.key)) out.set(pl.key, pl); } return [...out.values()]; };

// ================================================================= materials (shared by every creature)
// what each kind of surface is drawn with: the coat (by its feel), eyes, hard things (horn, claw, beak, shell), clear wings
const CLASS = { hide: 0, mane: 0, wing: 0, fin: 0, nose: 0, mouth: 0, lure: 0, comb: 0, hard: 2, hoof: 2, claw: 2, beak: 2, shank: 2, shell: 2, veil: 3 }, classOf = s => s.startsWith('eye') ? 1 : CLASS[s] ?? 0;
const COATS = { fur: { rough: .86 }, feathers: { rough: .78 }, skin: { rough: .66 }, scales: { rough: .46 }, slick: { rough: .3, clear: .4 }, shell: { rough: .34, clear: .5 } };
let MATS = null;
function mats(coat) {
  MATS ||= { eyes: pbr('#ffffff', { rough: .08, clear: 1, vertexColors: true }), hard: pbr('#ffffff', { rough: .4, vertexColors: true }), veil: pbr('#ffffff', { rough: .2, vertexColors: true, transparent: true, opacity: .45, depthWrite: false }), far: pbr('#ffffff', { rough: .8, vertexColors: true }) };
  const k = 'coat:' + (COATS[coat] ? coat : 'fur');
  if (!MATS[k]) { MATS[k] = pbr('#ffffff', { ...COATS[coat] || COATS.fur, vertexColors: true }); }
  for (const [n, m] of Object.entries(MATS)) m.name ||= 'creature:' + n;
  return [MATS[k], MATS.eyes, MATS.hard, MATS.veil];
}

// ================================================================= the coat: a colour for each point from where it is
const LIMB = /^(leg|shin|foot|arm|fore|hand)/, TIP = /^(wingtip|foot|hand|ear)/;
function painter(look, meta) {
  const main = new Color(look.colour), belly = new Color(look.belly), acc = new Color(look.accent), ps = look.ps || 0, ox = ps * .37, oy = ps * .61, oz = ps * .83, pat = look.pattern, H = meta.H || .3, lastTail = meta.tail?.[meta.tail.length - 1];
  /** col: set to the colour of a point of the coat at (x, y, z) facing (nx, ny, nz), mostly on `bone`. */
  return (col, x, y, z, ny, bone) => {
    col.copy(main);
    const limb = LIMB.test(bone);
    let k = 0;
    if (pat === 'spots') k = ss(.26, .4, lumps(x * 9 + ox, y * 9 + oy, z * 9 + oz) + .25 * lumps(x * 23 + oz, y * 23, z * 23 + ox));
    else if (pat === 'stripes') k = ss(.2, .55, Math.sin((limb ? y * 1.6 : z) * 27 + 2.4 * lumps(x * 3 + ox, y * 3 + oy, z * 3 + oz) + (limb ? 0 : abs(x) * 5))) * ss(-.55, .05, ny);
    else if (pat === 'patches') k = ss(-.02, .12, lumps(x * 3.6 + ox, y * 3.6 + oy, z * 3.6 + oz) + .2 * lumps(x * 9 + oz, y * 9 + ox, z * 9 + oy));
    else if (pat === 'bands') k = ss(-.1, .2, Math.sin(z * 30 + ps));
    else if (pat === 'socks') k = limb ? ss(H * .34, H * .2, y) : bone === lastTail ? .9 : 0;
    else if (pat === 'back') k = ss(.25, .8, ny) * .8;
    else if (pat === 'tips') k = TIP.test(bone) || bone === lastTail ? .9 : 0;
    else if (pat === 'hood') k = bone === 'head' || bone === 'neck' ? 1 : 0;
    // a paler belly: what faces the ground, and the insides of the legs a little
    const under = ss(.1, -.65, ny) * (limb ? .45 : 1);
    if (under > 0) col.lerp(belly, under);
    if (k > 0) col.lerp(acc, k * (1 - under * (pat === 'bands' ? 0 : .8)));
  };
}

// ================================================================= fur: strands in layers over a coat of fur (fur.js)
// how long each animal's fur is, as a part of its length (a seed makes one a little shaggier or sleeker), and how
// much of that grows where: short on the face and feet, long in a mane and a bushy tail, none on noses and claws
const FUR = { dog: .022, cat: .028, bear: .03, rabbit: .05, mouse: .03, deer: .012, beast: .035 }, MANE = 2.6, TAILS = { bushy: 1.8, thin: .5, stub: 1.1, curl: .4, thick: .8 };
function furOf(sl, bone, furry, tail, tailK) {
  if (sl === 'mane') return MANE;
  if (sl !== 'hide' || !furry) return 0;
  return bone === 'head' ? .55 : bone === 'jaw' ? .45 : /^(foot|hand)/.test(bone) ? .35 : /^(shin|fore)/.test(bone) ? .6 : tail.has(bone) ? tailK : 1;
}

/**
 * A creature made in code from a seed, on a skeleton of its own with walking, flying or swimming made for it.
 * kind: 'quad' (four legs) | 'bird' | 'fish' | 'insect' | 'monster'; like: the animal it is like (creature.likes
 * lists them: 'dog', 'cat', 'horse', 'deer', 'cow', 'pig', 'bear', 'rabbit', 'mouse', 'lizard'...); seed: its own
 * build, coat and size (none: the animal as the book shows it; kind alone: the seed picks which).
 * size (metres long; tall, for one that stands up), colour, belly, accent, pattern ('plain' | 'spots' | 'stripes' |
 * 'patches' | 'bands' | 'socks' | 'back' | 'tips'), eyes (colour), horn, beak, mane, wing, nose, shell (colours),
 * build ({ measure: value }: any of the kind's own measures, as creature.look.build lists them), detail (.5 coarser
 * .. 2 finer), shadows, fur (false: no layers of fur over a coat of fur, a mane or a tail of hair; or { length
 * (metres), layers, lean, tile (metres), from }: see fur.js).
 * Returns a Group, feet at y = 0 (a fish: its middle), facing +z: rig (a gs.poses Rig with this creature's own
 * cycles: 'idle', 'walk', 'run', and by kind 'trot', 'fly', 'glide', 'hover', 'swim', 'eat', 'sit', 'jump', 'attack',
 * 'hurt', 'dead'), move(dt, speed, { fly, turn }) (picks and blends the cycles for a speed in metres a second: the
 * easy way), speeds ({ walk, trot, run, fly, swim }: where each gait sits), bones (bones.head, bones.jaw...), mesh,
 * lods, lod (0 close .. 2 far; set it, or call see(camera, screenHeightInPixels) each frame), look (what the seed
 * chose), size ({ length, height, width } in metres), fur (its coat of fur in layers, or null: fur.length, fur.lean,
 * fur.level), twin() (another of the very same creature, sharing all but its skeleton: a herd costs little).
 * Make creatures in make() or reset(): a shape this phone hasn't sculpted yet takes a moment in the background
 * (the app shows "Loading…" and makes the game again), then it is saved. Several kinds? creature.all([...]) first.
 * now: true sculpts on the spot (tools and tests; the page stops while it does).
 */
export function creature(o = {}) {
  const plan = planOf(o);
  if (!made.has(plan.key)) { if (o.now) hold(plan.key, sculpt(job(plan))); else throw new StillLoading('gs.models.creature', load(plan)); }
  const e = made.get(plan.key), p = e.p; e.t = clock();
  let b = built.get(plan.key); if (!b) built.set(plan.key, b = build(job(plan)));
  tidy();
  const meta = b.meta, look = plan.look, M = mats(plan.p.coat ?? meta.coat), names = b.bones.map(q => q.name);

  // ---- the points, coloured for this creature
  const n = p.n, P = p.P, N = new Float32Array(n * 3), C = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), cls = new Uint8Array(n);
  const paint = painter(look, meta), col = new Color(), iris = new Color(look.eyes), flat = {
    mane: look.mane ?? look.accent, wing: look.wing ?? look.accent, fin: look.fin ?? look.accent, nose: look.nose ?? '#1e1715', mouth: '#3c1519', lure: look.lure ?? '#e8f4c8', hard: look.horn ?? '#cfc4ac', hoof: look.hoof ?? '#2b2622', claw: look.claw ?? '#3a332c', beak: look.beak ?? '#d99a2e', shank: look.legs ?? look.beak ?? '#3a332c', comb: look.comb ?? '#c8281e', shell: look.shell ?? look.accent, veil: '#e6eef6',
    eye0: '#0b0a0a', eye1: look.eyes, eye2: '#' + iris.clone().multiplyScalar(.35).getHexString(), eye3: look.white ?? '#1a1412',
  };
  const slotC = p.slots.map(s => s === 'hide' ? null : new Color(flat[s] ?? '#888888')), slotK = p.slots.map(classOf), bi = p.names.map(nm => Math.max(0, names.indexOf(nm))), grain = plan.p.coat ?? meta.coat ?? 'fur';
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], wide = 1e-6; for (let i = 0; i < n; i++) wide = Math.max(wide, abs(P[i * 3]));
  const dark = new Color(look.colour), mo = (look.ps || 0) * .21 + 3.3;
  const fo = o.fur === false ? null : typeof o.fur === 'object' && o.fur ? o.fur : {}, furry = grain === 'fur', grow = fo && (fo.layers ?? fur.layers()) > 0 ? new Float32Array(n) : null, tailSet = new Set(meta.tail || []), tailK = TAILS[plan.p.tail] ?? 1; let anyFur = false;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], s = p.slot[i], k = slotK[s], ao = p.ao[i] / 255, nx = p.N[i * 3] / 32767, ny = p.N[i * 3 + 1] / 32767, nz = p.N[i * 3 + 2] / 32767;
    N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz; cls[i] = k;
    if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
    let top = 0; for (let q = 1; q < 4; q++) if (p.SW[i * 4 + q] > p.SW[i * 4 + top]) top = q;
    if (slotC[s]) {
      col.copy(slotC[s]);
      // marks on a shell or a broad wing: spots, or dark edges with a few spots (a ladybird, a butterfly)
      if (look.marks && (p.slots[s] === 'shell' || p.slots[s] === 'wing')) { const k2 = (look.marks === 'edge' ? ss(.6, .9, abs(x) / wide) : 0) + ss(.3, .4, lumps(abs(x) * 7 + mo, y * 7 + mo * .6, z * 7 + mo * .3)) * (look.marks === 'edge' ? .8 : 1); if (k2 > 0) col.lerp(dark, Math.min(1, k2)); }
    } else paint(col, x, y, z, ny, p.names[p.SI[i * 4 + top]]);
    if (grow && (grow[i] = furOf(p.slots[s], p.names[p.SI[i * 4 + top]], furry, tailSet, tailK))) anyFur = true;
    if (k === 0) col.multiplyScalar(grain === 'scales' ? .88 + .2 * abs(lumps(x * 60, y * 60, z * 60)) : grain === 'fur' || grain === 'feathers' ? .93 + .1 * lumps(x * 44, y * 44, z * 44) + .04 * lumps(x * 150, y * 150, z * 150) : .97 + .05 * lumps(x * 30, y * 30, z * 30));
    // creases in soft shadow; and no coat brighter than white fur is (a pure white would glow in sunlight)
    let sh = k === 1 ? .55 + .45 * ao : .3 + .7 * ao; const top2 = Math.max(col.r, col.g, col.b); if (k !== 1 && top2 > .6) sh *= (.6 + (top2 - .6) * .35) / top2;
    C[i * 3] = col.r * sh; C[i * 3 + 1] = col.g * sh; C[i * 3 + 2] = col.b * sh;
    const ws = p.SW[i * 4] + p.SW[i * 4 + 1] + p.SW[i * 4 + 2] + p.SW[i * 4 + 3] || 1;
    for (let q = 0; q < 4; q++) { SI[i * 4 + q] = bi[p.SI[i * 4 + q]]; SW[i * 4 + q] = p.SW[i * 4 + q] / ws; }
  }
  const attrs = { position: new BufferAttribute(P, 3), normal: new BufferAttribute(N, 3), color: new BufferAttribute(C, 3), skinIndex: new BufferAttribute(SI, 4), skinWeight: new BufferAttribute(SW, 4) };
  // each level: its triangles in groups by material (the far one: a single plain material)
  const mid = new Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2), rad = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  const matsFor = [M, M, [MATS.far]], groupOf = [k => k, k => k, () => 0];
  const geos = [0, 1, 2].map(L => {
    const by = matsFor[L].map(() => []), I = p.I[L];
    for (let t = 0; t < I.length; t += 3) { const a = I[t], b2 = I[t + 1], c = I[t + 2], k = cls[b2] === cls[c] ? cls[b2] : cls[a]; by[groupOf[L](k)].push(a, b2, c); }
    const g = new BufferGeometry(); for (const k in attrs) g.setAttribute(k, attrs[k]);
    const all = new Uint32Array(by.reduce((a, l) => a + l.length, 0)); let s = 0; by.forEach((l, i) => { all.set(l, s); if (l.length) g.addGroup(s, l.length, i); s += l.length; });
    g.setIndex(new BufferAttribute(n > 65535 ? all : new Uint16Array(all), 1));
    g.boundingSphere = new Sphere(mid.clone(), rad * 1.15); return g;
  });

  const sh = o.shadows !== false, scale = plan.size / (meta.span || 1), tris = geos.map(g => g.index.count / 3), mv = movesFor(meta, scale);

  // ---- its fur: layers of strands over the coat (fur.js), kept clear of the eyes; the layers are made in stand()
  let shellGeo = null;
  if (anyFur) {
    const sides = [[], [], []]; for (let i = 0; i < n; i++) if (cls[i] === 1) sides[P[i * 3] < -1e-4 ? 0 : P[i * 3] > 1e-4 ? 2 : 1].push(i);
    for (const l of sides) {
      if (!l.length) continue;
      let cx = 0, cy = 0, cz = 0, r = 0; for (const i of l) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; } cx /= l.length; cy /= l.length; cz /= l.length;
      for (const i of l) r = Math.max(r, Math.hypot(P[i * 3] - cx, P[i * 3 + 1] - cy, P[i * 3 + 2] - cz));
      for (let i = 0; i < n; i++) if (grow[i]) grow[i] *= ss(r * 1.0, r * 1.6, Math.hypot(P[i * 3] - cx, P[i * 3 + 1] - cy, P[i * 3 + 2] - cz));
    }
    const shag = plan.seed == null ? 1 : .8 + .45 * ((Math.imul(plan.seed | 0, 2246822519) >>> 8) / 16777216), span = meta.span || 1;
    // on the middle level's triangles (strands hide what a finer surface under them would add), but the head on the
    // finest: its fur is short and its shapes small, and a coarser coat would lie under the skin round the eyes
    const headB = new Set(['head', 'jaw'].map(b => p.names.indexOf(b)).filter(b => b >= 0)), onHead = new Uint8Array(n), idx = [];
    for (let i = 0; i < n; i++) { let top = 0; for (let q = 1; q < 4; q++) if (p.SW[i * 4 + q] > p.SW[i * 4 + top]) top = q; onHead[i] = headB.has(p.SI[i * 4 + top]) ? 1 : 0; }
    if (fo.from != null) idx.push(...p.I[fo.from]);
    else for (const [I, face] of [[p.I[1], 0], [p.I[0], 1]]) for (let t = 0; t < I.length; t += 3) if ((onHead[I[t]] & onHead[I[t + 1]] & onHead[I[t + 2]]) === face) idx.push(I[t], I[t + 1], I[t + 2]);
    shellGeo = fur.shell(geos[0], {
      index: idx, where: grow, flow: fo.flow, ease: fo.ease,
      length: fo.length > 0 ? fo.length / scale : (FUR[plan.like] ?? .03) * shag * span,
      tile: (fo.tile > 0 ? fo.tile : Math.max(.015, Math.min(.12, plan.size * .07))) / scale,
    });
    if (!shellGeo.userData.fur.tris) shellGeo = null;
  }
  const stand = () => {
    const B = {};
    for (const q of b.bones) { const bone = new Bone(); bone.name = q.name; if (meta.order?.[q.name]) bone.rotation.order = meta.order[q.name]; B[q.name] = bone; }
    const at = Object.fromEntries(b.bones.map(q => [q.name, q.at]));
    for (const q of b.bones) { if (q.parent) { const pa = at[q.parent]; B[q.name].position.set(q.at[0] - pa[0], q.at[1] - pa[1], q.at[2] - pa[2]); B[q.parent].add(B[q.name]); } else B[q.name].position.set(q.at[0], q.at[1], q.at[2]); }
    const root = new Group(); root.add(B[b.bones[0].name]); root.updateMatrixWorld(true);
    const skel = new Skeleton(b.bones.map(q => B[q.name]));
    const lods = geos.map((g, L) => { const m = new SkinnedMesh(g, matsFor[L]); m.castShadow = m.receiveShadow = sh; m.name = 'creature' + L; m.frustumCulled = true; m.boundingSphere = new Sphere(mid.clone(), rad * 1.6); root.add(m); m.bind(skel, new Matrix4()); m.visible = L === 0; return m; });
    root.scale.setScalar(scale);
    root.name = 'creature'; root.mesh = lods[0]; root.lods = lods; root.bones = B; root.kind = plan.kind; root.like = plan.like;
    root.rig = new Rig(B, { height: meta.H || 1, joints: names, poses: mv.poses, fade: .22 });
    root.speeds = { ...mv.speeds };
    root.size = { length: (hi[2] - lo[2]) * scale, height: (hi[1] - lo[1]) * scale, width: (hi[0] - lo[0]) * scale };
    root.look = { kind: plan.kind, like: plan.like, seed: plan.seed, size: plan.size, ...look, build: { ...plan.p } };
    let cur = 0;
    Object.defineProperty(root, 'lod', { get: () => cur, set(v) { v = Math.max(0, Math.min(2, v | 0)); if (v !== cur) { lods[cur].visible = false; lods[v].visible = true; cur = v; } } });
    /** Picks the level of detail by how big the creature is on screen (pixels): call each frame, or now and then. */
    const wp = new Vector3(), big = Math.max(root.size.length, root.size.height);
    root.see = (cam, screenH = 800) => {
      const d = cam.position.distanceTo(root.getWorldPosition(wp)), px = big * (root.scale.y / scale) / (2 * Math.max(.05, d) * Math.tan((cam.fov || 50) * PI / 360)) * screenH * ([.5, .75, 1, 1][HD.tier] ?? 1);
      root.lod = px > (cur === 0 ? 150 : 180) ? 0 : px > (cur <= 1 ? 40 : 50) ? 1 : 2; return root.lod;
    };
    /**
     * Moves its legs, wings or tail for a speed (metres a second; 0: it stands, hovers or drifts): the gaits are
     * blended by where the speed sits among creature.speeds. fly: true for one in the air; swim: true for a serpent in
     * water (a fish always swims); turn: how hard it turns
     * (-1..1; it leans). For a pose by name (rig.play('eat')) call rig.update(dt, { speed }) yourself instead.
     */
    root.move = (dt, speed = 0, { fly = false, swim = false, turn = 0 } = {}) => {
      const v = abs(speed), space = fly && mv.air ? mv.air : swim && mv.water ? mv.water : mv.ground || mv.water;
      root.rig.blend(space, v).update(dt, { speed: v, turn });
      if (root.fur && root.fur.level > 0) { const want = lean0 + .45 * Math.min(1, v / (mv.speeds.run || mv.speeds.fly || 3)), d = want - root.fur.lean; if (abs(d) > .01) root.fur.lean += d * Math.min(1, dt * 6); }   // (the faster it goes, the flatter its fur lies)
      return root;
    };
    root.tris = tris; root.twin = stand;
    root.fur = shellGeo ? fur(lods[0], { ...fo, shell: shellGeo, size: big / scale }) : null; const lean0 = root.fur ? root.fur.lean : 0;
    return root;
  };
  return stand();
}
/** The kinds of creature, and every animal one can be like (with its kind). */
creature.kinds = CREATURE_KINDS; creature.likes = CREATURE_LIKES;
/**
 * Several creatures at once: creature.all([options, options...]) => the creatures, in the same order. Everything
 * that still needs sculpting is started together, so the app waits once.
 */
creature.all = list => {
  const miss = missing(list.filter(o => !o.now));
  if (miss.length) throw new StillLoading('gs.models.creature', Promise.all(miss.map(load)));
  return list.map(o => creature(o));
};
/** Starts sculpting whatever these creatures still need and throws the app's "still loading" if anything does (first thing in make(), before anything costly is built); nothing otherwise. */
creature.need = list => { const miss = missing(list.filter(o => !o.now)); if (miss.length) throw new StillLoading('gs.models.creature', Promise.all(miss.map(load))); };
/** For tools and tests: a promise that settles once creature(options) for each of these would come straight back. */
creature.ready = list => Promise.all(missing([].concat(list)).map(load)).then(() => true);
/** Forgets every saved sculpt (Settings › clear cache, tests). */
creature.clear = async () => { made.clear(); built.clear(); const db = await open(); if (db) await tx(db, 'readwrite', (s, w) => { s.clear(); w.clear(); }); };
