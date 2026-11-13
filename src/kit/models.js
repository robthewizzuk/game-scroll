// gs.models: things made in code, ready to drop in a Next Gen scene, so a game stays one .js file
// with no image or model files. Materials from recipes (wood, brick, rust...), and (more to come)
// props, trees, buildings, sculpted shapes and people built from them.
// Each part lives in src/kit/models/.
export { material, NAMES as materials } from './models/materials.js';
import { warm } from './models/cache.js';
import { loadTrees } from './models/trees.js';
/** Loads what gs.models needs before a game runs (saved texture bakes, the tree grower). */
export const ready = () => Promise.all([warm(), loadTrees()]);
export { wear, curvature } from './models/wear.js';
export { prop, PROP_NAMES as props } from './models/props.js';
export { sculpt } from './models/sculpt.js';
export { tree, ivy, weeds, TREE_KINDS as trees } from './models/trees.js';
export { building, BUILDING_STYLES as buildings } from './models/buildings.js';
export { human } from './models/human.js';
export { creature } from './models/creature.js';
export { vehicle } from './models/vehicles.js';
export { relief } from './relief.js';
export { fur } from './models/fur.js';
