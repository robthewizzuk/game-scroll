// gs.models.fort(options): a castle's walls in code: a stretch of curtain wall with its walk and battlements, a round
// tower, and a gatehouse (two towers, an arched way through and a portcullis that lifts). Stone from the material
// recipes, aged with wear(). Each comes back as a Group (one mesh per material, the portcullis its own child), its
// foot at y = 0 and its outside facing +z, with userData.solid: the boxes a physics world should know of
// (gs.town makes them solid in its World3D). Kit use only: games reach it as gs.models.fort.
import { pause, built, loading } from '../slices.js';
import { Group, Mesh, Shape, Path, ExtrudeGeometry, CylinderGeometry, ConeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { slim } from '../slim.js';
import { Build, boxUV, rngOf } from './props.js';
import { material } from './materials.js';
import { wear } from './wear.js';

const SLOTS = {
  wall: ['stone', { colour: '#a39c8e', dark: '#6e685e' }],
  trim: ['stone', { colour: '#bab4a6', dark: '#8c867a' }],
  roof: ['stone', { colour: '#4e5058', dark: '#2e3036' }],
  wood: ['planks', { colour: '#5a3a1f', dark: '#30200e' }],
  iron: ['metal', { colour: '#2e2c2a' }],
};
const mats = new Map(), made = new Map();
const matOf = (slot, colour) => { const [n, look] = SLOTS[slot], o = { ...look, ...(colour && slot === 'wall' ? { colour } : {}) }, k = n + JSON.stringify(o); if (!mats.has(k)) mats.set(k, material(n, o)); return mats.get(k); };
export const FORT_KINDS = ['wall', 'tower', 'gate'];

/**
 * A piece of a castle. kind: 'wall' (length, 12; height, 7; thick, 2.6: a curtain wall along x with a walk on top,
 * battlements on its outside (+z) and a low parapet inside), 'tower' (radius, 3; height: the wall's + 3; roof: true for
 * a cone of slate, else battlements), 'gate' (width of the way through, 3.4; height; a gatehouse with a tower each side,
 * the way through along z, and its portcullis: the child named 'portcullis', userData.lift metres up it goes to be open).
 * colour (the stone), seed, wear (wear() options or false), materials ({ wall, trim, roof, wood, iron }: your own).
 * The same options again give a copy sharing shapes and materials. userData.solid: [{ at: [x, y, z], size: [w, h, d] }]
 * in the piece's own frame; userData.walk: the height of its wall walk.
 */
export function fort(o = {}) {
  const kind = o.kind || 'wall';
  if (!FORT_KINDS.includes(kind)) throw new Error(`gs.models.fort: no kind '${kind}' (try ${FORT_KINDS.join(', ')})`);
  const { length = 12, height = 7, thick = 2.6, radius = 3, width = 3.4, roof = false, colour = o.color, seed = 0, wear: wr = {}, materials: own = null } = o;
  const key = JSON.stringify([kind, length, height, thick, radius, width, roof, colour, seed, wr, own && Object.entries(own).map(([k, m]) => k + m.uuid)]);
  let p = made.get(key);
  if (!p) {
    pause('Models');
    p = make(kind, { length, height, thick, radius, width, roof, colour, seed, wr, own });
    if (made.size >= 32 && !loading()) made.delete(made.keys().next().value);
    made.set(key, p); built();
  }
  const out = new Group(); out.name = 'fort:' + kind; out.userData.fort = kind;
  for (const q of p.parts) { const m = new Mesh(q.geo, q.mat); m.castShadow = true; m.receiveShadow = true; m.name = q.slot; out.add(m); }
  if (p.gate) {
    const g = new Group(); g.name = 'portcullis'; g.userData.lift = p.gate.lift;
    const m = new Mesh(p.gate.geo, p.gate.mat); m.castShadow = true; m.name = 'iron'; g.add(m); out.add(g);
  }
  out.userData.solid = p.solid.map(s => ({ at: [...s.at], size: [...s.size] })); out.userData.walk = p.walk;
  return out;
}

function make(kind, { length: L, height: H, thick: T, radius: R, width: GW, roof, colour, seed, wr, own }) {
  const b = new Build(), r = rngOf(seed + 5), solid = [];
  // battlements along a line at height y: merlons across [x0, x1] at z, coped
  const crenel = (x0, x1, y, z, depth, along = 'x') => {
    const len = x1 - x0, n = Math.max(2, Math.round(len / 1.4)), mw = Math.min(.8, len / n * .55);
    for (let i = 0; i < n; i++) {
      const c = x0 + (i + .5) * len / n, hh = .85 + (r() - .5) * .04;
      if (along === 'x') { b.box('wall', mw, hh, depth, [c, y + hh / 2, z]); b.box('trim', mw + .08, .1, depth + .08, [c, y + hh + .05, z]); }
      else { b.box('wall', depth, hh, mw, [z, y + hh / 2, c]); b.box('trim', depth + .08, .1, mw + .08, [z, y + hh + .05, c]); }
    }
  };
  const ringOf = (rad, y, n) => {   // merlons round a tower's top
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const a = i / n * Math.PI * 2, w = rad * Math.PI * 2 / n * 1.05;
      b.box('wall', w, .9, .5, [Math.sin(a) * (rad - .25), y + .45, Math.cos(a) * (rad - .25)], [0, a, 0]);
      b.box('trim', w + .08, .1, .58, [Math.sin(a) * (rad - .25), y + .95, Math.cos(a) * (rad - .25)], [0, a, 0]);
    }
  };
  const tower = (x, z, rad, h, cone) => {
    b.add('wall', new CylinderGeometry(rad, rad * 1.08, h, 28, 1), [x, h / 2, z]);
    b.add('trim', new CylinderGeometry(rad + .18, rad + .18, .35, 28, 1), [x, h + .17, z]);   // the corbelled lip
    b.add('wall', new CylinderGeometry(rad * 1.1, rad * 1.18, 1.2, 28, 1), [x, .6, z]);        // the battered foot
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4, y = h * (.35 + .18 * (i % 2)), at = rad * (1.08 - .08 * y / h) + .015; b.box('iron', .08, .8, .06, [x + Math.sin(a) * at, y, z + Math.cos(a) * at], [0, a, 0]); }   // arrow slits (dark)
    if (cone) b.add('roof', new ConeGeometry(rad + .45, rad * 2.2, 28, 1), [x, h + .35 + rad * 1.1, z]);
    else { b.add('trim', new CylinderGeometry(rad + .1, rad + .1, .1, 28, 1), [x, h + .4, z]); ringOf(rad + .1, h + .35, 18); }
    solid.push({ at: [x, h / 2, z], size: [rad * 1.8, h, rad * 1.8] });
  };
  let walk = H, gate = null;
  if (kind === 'wall') {
    b.box('wall', L, H, T, [0, H / 2, 0]);
    b.box('wall', L, 1.1, T + .5, [0, .55, .0]);   // a battered foot
    b.box('trim', L, .14, T + .2, [0, H + .07, 0]);   // the walk
    b.box('wall', L, .55, .45, [0, H + .14 + .27, T / 2 - .22]); crenel(-L / 2, L / 2, H + .69, T / 2 - .22, .45);   // battlements outside
    b.box('wall', L, .8, .35, [0, H + .14 + .4, -T / 2 + .17]); b.box('trim', L, .08, .42, [0, H + .98, -T / 2 + .17]);   // parapet inside
    solid.push({ at: [0, H / 2, 0], size: [L, H, T] });
    walk = H + .14;
  } else if (kind === 'tower') {
    tower(0, 0, R, H + 3, roof);
    walk = H + 3.35;
  } else {
    // the gatehouse: a block with an arched way through along z, towers either side, a portcullis in the outer arch
    const BW = GW + 2.4, D = T + 1.6, archH = Math.min(H - 1.6, GW * .9 + 1.4), gh = H + 1.2;
    const face = new Shape(); face.moveTo(-BW / 2, 0); face.lineTo(BW / 2, 0); face.lineTo(BW / 2, gh); face.lineTo(-BW / 2, gh); face.closePath();
    const hole = new Path(); hole.moveTo(-GW / 2, 0); hole.lineTo(GW / 2, 0); hole.lineTo(GW / 2, archH - GW / 2); hole.absarc(0, archH - GW / 2, GW / 2, 0, Math.PI, false); hole.lineTo(-GW / 2, 0); face.holes.push(hole);
    b.add('wall', new ExtrudeGeometry(face, { depth: D, bevelEnabled: false, curveSegments: 10 }), [0, 0, -D / 2]);
    const ring = new Shape(); ring.moveTo(GW / 2 + .45, 0); ring.lineTo(GW / 2 + .45, archH - GW / 2); ring.absarc(0, archH - GW / 2, GW / 2 + .45, 0, Math.PI, false); ring.lineTo(-GW / 2 - .45, 0); ring.lineTo(-GW / 2, 0); ring.lineTo(-GW / 2, archH - GW / 2);
    ring.absarc(0, archH - GW / 2, GW / 2, Math.PI, 0, true); ring.lineTo(GW / 2, 0); ring.closePath();
    b.add('trim', new ExtrudeGeometry(ring, { depth: .2, bevelEnabled: false, curveSegments: 10 }), [0, 0, D / 2 - .05]);   // the arch's dressed stones, outside
    b.box('trim', BW + .2, .14, D + .2, [0, gh + .07, 0]); crenel(-BW / 2, BW / 2, gh + .14, D / 2 - .22, .45); crenel(-BW / 2, BW / 2, gh + .14, -D / 2 + .22, .45);
    for (const s of [-1, 1]) {
      tower(s * (BW / 2 + 1.9), .4, 2.3, H + 3, roof);
      solid.push({ at: [s * (GW / 2 + (BW - GW) / 4), gh / 2, 0], size: [(BW - GW) / 2, gh, D] });   // the gatehouse's sides of the way through
    }
    solid.push({ at: [0, archH + (gh - archH) / 2, 0], size: [GW, gh - archH, D] });   // over the way through
    // the portcullis: a grid of iron bars with spiked feet, in a slot just inside the outer face
    const g = new Build(), bars = Math.round(GW / .3);
    for (let i = 0; i <= bars; i++) { const x = -GW / 2 + .1 + i * (GW - .2) / bars; g.box('iron', .07, archH, .07, [x, archH / 2, D / 2 - .5]); g.add('iron', new ConeGeometry(.06, .2, 6), [x, -.1, D / 2 - .5], [Math.PI, 0, 0]); }
    for (let j = 1; j < 6; j++) g.box('iron', GW - .1, .07, .07, [0, j * archH / 6, D / 2 - .5]);
    const gg = boxUV(mergeGeometries(g.slots.get('iron'), false), 1); for (const x of g.slots.get('iron')) x.dispose();
    gate = { geo: gg, mat: own?.iron || matOf('iron'), lift: archH - .4 };
    walk = gh + .14;
  }
  const parts = [];
  for (const [slot, geos] of b.slots) {
    const g = boxUV(mergeGeometries(geos, false), 1); for (const x of geos) x.dispose();
    const m = new Mesh(g, own?.[slot] || matOf(slot, colour));
    if (wr !== false && (slot === 'wall' || slot === 'trim')) wear(m, { seed, split: false, edges: .45, dirt: .6, ground: 1.6, moss: .15, ...wr });
    slim(m.geometry);
    parts.push({ slot, geo: m.geometry, mat: m.material });
  }
  return { parts, gate, solid, walk };
}
