// gs.models.tree(kind, options): a grown tree (EZ-Tree by Daniel Greenheck: branches that split, bend
// and taper, leaves on the twigs), dressed in the 'bark' recipe and leaves drawn in code that sway in
// the wind and glow with the sun behind them (gs.outdoors' leaves look). No image files. Palms, tropical
// and swamp plants, reeds and flowers grow by rules of their own (plants.js), as do ivy and weeds.
// Kit use only: games reach it as gs.models.tree, gs.models.ivy and gs.models.weeds.
import { Group, Mesh, DoubleSide, MeshStandardMaterial } from 'three';
import { getLeafTexture } from './tree-textures.js';
import { material } from './materials.js';
import { looks } from '../looks.js';
import { pause, built, loading } from '../slices.js';
import { plant, plantHeight, ivy as growIvy, weeds as growWeeds, PLANT_KINDS } from './plants.js';
import { linksFor } from '../links.js';

// (links.js) with no wind or bend given, a plant sways in the Wind the game made and is brushed aside through the Marks it made
// (made before the plant); false: a breeze of its own, and nothing brushes it
function found(o) {
  if (o.wind != null && o.bend != null) return o;
  const L = o.link === false ? null : linksFor(null); if (!L && o.wind !== false && o.bend !== false) return o;
  const out = { ...o };
  if (o.wind == null) { const w = L?.one('wind'); if (w) out.wind = w; } else if (o.wind === false) out.wind = undefined;
  if (o.bend == null) { const m = L?.one('marks'); if (m?.grass?.texture) out.bend = m; } else if (o.bend === false) out.bend = undefined;
  return out;
}

const PRESET = { oak: 'Oak', ash: 'Ash', aspen: 'Aspen', pine: 'Pine' }, SIZES = { small: 'Small', medium: 'Medium', large: 'Large' };
const HEIGHT = { oak: 9, ash: 10, aspen: 11, pine: 12, bush: 1.4 };
export const TREE_KINDS = ['oak', 'ash', 'aspen', 'pine', 'bush', ...PLANT_KINDS];

// EZ-Tree loads with the rest of gs.models (ready(), while the game loads), as its own small file
let lib = null;
/** Loads EZ-Tree (never rejects: where it can't load, tree() says so). */
export const loadTrees = () => lib ? Promise.resolve() : import('ez-tree/lib').then(m => { lib = m; }, () => {});

// every tree's leaves sway on one clock: the view's own (v.t, which stops when the game pauses), set by
// whichever tree draws first each frame
const sway = { lkTime: { value: 0 }, lkWind: { value: .6 } };
const tick = (r, scene) => { const v = scene?.gsView; sway.lkTime.value = v ? v.t % 3600 : (performance.now() / 1000) % 3600; };

// made: a tree's shapes and bark by what was asked for. Not by which Wind or Marks it was given: those are made again with the
// game on every pass of a card's loading (slices.js), and a memory keyed by them would never give anything back. Leaf materials
// do depend on them, so they are kept per Wind or field (and go when it does); with neither, in `mats`.
const made = new Map(), mats = new Map(), matsOf = new WeakMap(), fields = new WeakMap(); let fieldN = 0;
const shelf = (wind, part) => { const o = wind && typeof wind === 'object' ? wind : part; if (!o) return mats; let m = matsOf.get(o); if (!m) matsOf.set(o, m = new Map()); return m; };
const fieldOf = bend => bend ? (bend.grass?.texture ? bend.grass : bend.texture ? bend : null) : null;   // (a gs.outdoors.Marks, or its grass field)
const idOf = f => { if (!f) return 0; let i = fields.get(f); if (!i) fields.set(f, i = ++fieldN); return i; };
function leafMat(type, colour, wind, part = null) {
  const k = type + colour + (typeof wind === 'number' ? wind : 'w' + idOf(wind)) + '|' + idOf(part), mats = shelf(wind, part);
  if (mats.has(k)) return mats.get(k);
  const m = new MeshStandardMaterial({ map: getLeafTexture(type), color: colour, alphaTest: .5, side: DoubleSide, roughness: .8 });
  looks.leaves(m, { time: sway.lkTime, wind: wind ?? sway.lkWind, sway: .006, above: .5, atlas: [128, 128], part, push: [.45, 1.1] });
  mats.set(k, m);
  return m;
}

/**
 * A tree or plant: 'oak' | 'ash' | 'aspen' | 'pine' | 'bush' (grown by EZ-Tree), or 'palm' | 'fan' (palms) |
 * 'banana' | 'fern' | 'taro' (tropical: banana, fern or tree fern, elephant ears) | 'cypress' | 'reeds' | 'lily'
 * (swamp: a bald cypress with knees and hanging moss, reeds and cattails, lily pads) | 'flowers'. Options: size
 * 'small' | 'medium' | 'large' (its shape), height (metres, whole tree), seed (another tree of the same kind),
 * leaves (colour), bark (bark colour), wind (how hard leaves sway, .6; or a gs.outdoors Wind), bend (a
 * gs.outdoors.Marks: leaves brushed aside by whoever walks through; make the Marks first). The plants' own
 * options are in plants.js. A Group (branches + leaves, and fruit, flowers or moss for some), its foot at
 * y = 0. The same options again give a copy sharing shapes and materials.
 */
export function tree(kind = 'oak', o = {}) {
  o = found(o);
  if (!TREE_KINDS.includes(kind)) throw new Error(`gs.models.tree: no tree '${kind}' (try ${TREE_KINDS.join(', ')})`);
  if (PLANT_KINDS.includes(kind)) return plant(kind, { ...o, height: o.height ?? (o.size === 'small' ? .6 : o.size === 'large' ? 1.4 : 1) * plantHeight(kind) }, sway, tick);
  if (!lib) throw new Error('gs.models.tree: not loaded yet (make trees in make() or reset())');
  const { size = 'medium', seed = 0, height = HEIGHT[kind] * (size === 'small' ? .6 : size === 'large' ? 1.4 : 1), leaves = kind === 'pine' ? '#3f6a3a' : '#5a8a3a', bark = kind === 'aspen' ? '#c8c2b4' : '#6a5440', wind, bend } = o, part = fieldOf(bend);
  const key = JSON.stringify([kind, size, seed, height, bark]);
  let parts = made.get(key);
  if (!parts) {
    pause('Models');   // (while a card loads, a frame may go by before each new tree: slices.js)
    const name = kind === 'bush' ? 'Bush ' + (1 + (seed % 3)) : PRESET[kind] + ' ' + SIZES[size];
    const t = new lib.Tree(); t.options.copy(structuredClone(lib.TreePreset[name]));
    t.options.seed = (t.options.seed + seed * 7919) >>> 0;
    t.options.bark.textured = false;
    t.generate();
    t.branchesMesh.geometry.computeBoundingBox();
    const bb = t.branchesMesh.geometry.boundingBox, k = height / Math.max(bb.max.y - bb.min.y, 1e-3);
    const fit = g => { g.translate(0, -bb.min.y, 0); g.scale(k, k, k); g.computeBoundingSphere(); g.computeBoundingBox(); return g; };
    const bg = fit(t.branchesMesh.geometry), lg = fit(t.leavesMesh.geometry);
    // the bark recipe wrapped round each branch: EZ-Tree's uvs run round (u) and along (v)
    const bm = material('bark', { colour: bark, repeat: [2, Math.max(2, Math.round(height / 2))] });
    t.leavesMesh.material.dispose(); t.branchesMesh.material.dispose();
    parts = { bg, lg, bm, type: t.options.leaves.type };
    if (made.size >= 48 && !loading()) made.delete(made.keys().next().value);
    made.set(key, parts); built();
  }
  const out = new Group(); out.name = 'tree:' + kind; out.userData.tree = kind;
  const b = new Mesh(parts.bg, parts.bm), l = new Mesh(parts.lg, leafMat(parts.type, leaves, wind, part));
  b.castShadow = b.receiveShadow = l.castShadow = l.receiveShadow = true; b.name = 'branches'; l.name = 'leaves';
  l.onBeforeRender = tick;
  out.add(b, l);
  return out;
}

/**
 * Ivy grown over meshes (plants.js ivy): vines that climb from the foot of the walls, keep to the surface,
 * branch, go over edges and hang where there is nothing to hold, with leaves facing out. targets: a mesh, a
 * group or a list, where they stand now. Options: seed, roots, from, length, leaves, stem, size, density, up,
 * wind, bend. A Group in world metres.
 */
export const ivy = (targets, o = {}) => growIvy(targets, found(o), sway, tick);
/**
 * Weeds in cracks, along kerbs and at the foot of walls (plants.js weeds): lines, walls, spots, ground, gap,
 * height, colours, seed, wind, bend, max. One InstancedMesh.
 */
export const weeds = (o = {}) => growWeeds(found(o), sway, tick);
