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
export { fort, FORT_KINDS as forts } from './models/castle.js';
export { human } from './models/human.js';
export { creature } from './models/creature.js';
export { vehicle } from './models/vehicles.js';
export { weapon, WEAPON_KINDS as weapons, Wield } from './models/weapons.js';
export { relief } from './relief.js';
export { fur } from './models/fur.js';
import { Creator as MakeCreator } from './models/human-looks.js';
import { human as makeHuman } from './models/human.js';
export { LOOK_SHAPES as looks, CREATOR_SLIDERS, CREATOR_PICKS } from './models/human-looks.js';
/** A character creator on gs.models.human: new Creator(options, { onSwap }) (human-looks.js). */
export class Creator extends MakeCreator { constructor(o, opts) { super(makeHuman, o, opts); } }
