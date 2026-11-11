// gs.models.tree(kind, options): a grown tree (EZ-Tree by Daniel Greenheck: branches that split, bend
// and taper, leaves on the twigs), dressed in the 'bark' recipe and leaves drawn in code that sway in
// the wind and glow with the sun behind them (gs.outdoors' leaves look). No image files.
// Kit use only: games reach it as gs.models.tree.
import { Group, Mesh, DoubleSide, MeshStandardMaterial } from 'three';
import { getLeafTexture } from './tree-textures.js';
import { material } from './materials.js';
import { looks } from '../looks.js';
import { pause, built, loading } from '../slices.js';

const PRESET = { oak: 'Oak', ash: 'Ash', aspen: 'Aspen', pine: 'Pine' }, SIZES = { small: 'Small', medium: 'Medium', large: 'Large' };
const HEIGHT = { oak: 9, ash: 10, aspen: 11, pine: 12, bush: 1.4 };
export const TREE_KINDS = ['oak', 'ash', 'aspen', 'pine', 'bush'];

// EZ-Tree loads with the rest of gs.models (ready(), while the game loads), as its own small file
let lib = null;
/** Loads EZ-Tree (never rejects: where it can't load, tree() says so). */
export const loadTrees = () => lib ? Promise.resolve() : import('ez-tree/lib').then(m => { lib = m; }, () => {});

// every tree's leaves sway on one clock: the view's own (v.t, which stops when the game pauses), set by
// whichever tree draws first each frame
const sway = { lkTime: { value: 0 }, lkWind: { value: .6 } };
const tick = (r, scene) => { const v = scene?.gsView; sway.lkTime.value = v ? v.t % 3600 : (performance.now() / 1000) % 3600; };

const made = new Map(), mats = new Map();
function leafMat(type, colour, wind) {
  const k = type + colour + (typeof wind === 'number' ? wind : 'w');
  if (mats.has(k)) return mats.get(k);
  const m = new MeshStandardMaterial({ map: getLeafTexture(type), color: colour, alphaTest: .5, side: DoubleSide, roughness: .8 });
  looks.leaves(m, { time: sway.lkTime, wind: wind ?? sway.lkWind, sway: .006, above: .5, atlas: [128, 128] });
  mats.set(k, m);
  return m;
}

/**
 * A tree: 'oak' | 'ash' | 'aspen' | 'pine' | 'bush'. Options: size 'small' | 'medium' | 'large' (its
 * shape), height (metres, whole tree), seed (another tree of the same kind), leaves (colour), bark
 * (bark colour), wind (how hard leaves sway, .6; or a gs.outdoors Wind). A Group (branches + leaves),
 * its foot at y = 0. The same options again give a copy sharing shapes and materials.
 */
export function tree(kind = 'oak', o = {}) {
  if (!lib) throw new Error('gs.models.tree: not loaded yet (make trees in make() or reset())');
  if (!TREE_KINDS.includes(kind)) throw new Error(`gs.models.tree: no tree '${kind}' (try ${TREE_KINDS.join(', ')})`);
  const { size = 'medium', seed = 0, height = HEIGHT[kind] * (size === 'small' ? .6 : size === 'large' ? 1.4 : 1), leaves = kind === 'pine' ? '#3f6a3a' : '#5a8a3a', bark = kind === 'aspen' ? '#c8c2b4' : '#6a5440', wind } = o;
  const key = JSON.stringify([kind, size, seed, height, leaves, bark, typeof wind === 'number' ? wind : !!wind]);
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
    parts = { bg, lg, bm, lm: leafMat(t.options.leaves.type, leaves, wind) };
    if (made.size >= 48 && !loading()) made.delete(made.keys().next().value);
    made.set(key, parts); built();
  }
  const out = new Group(); out.name = 'tree:' + kind; out.userData.tree = kind;
  const b = new Mesh(parts.bg, parts.bm), l = new Mesh(parts.lg, parts.lm);
  b.castShadow = b.receiveShadow = l.castShadow = l.receiveShadow = true; b.name = 'branches'; l.name = 'leaves';
  l.onBeforeRender = tick;
  out.add(b, l);
  return out;
}
