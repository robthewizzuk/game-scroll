// gs.models.prop(name, options): everyday things for a Next Gen scene (crates, barrels, furniture,
// street bits...) built in code from simple shapes, dressed in the material recipes and aged with
// wear(), so a game needs no model files. Each comes back as a Group holding one mesh per material
// (few draw calls), its foot at y = 0, facing +z, ready to place.
// Kit use only: games reach it as gs.models.prop.
import { pause, built, loading } from '../slices.js';
import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, LatheGeometry, Group, Mesh, Matrix4, Euler, Quaternion, Vector3, Vector2, BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { material } from './materials.js';
import { wear } from './wear.js';
import { pbr } from '../hd3d.js';

export const rngOf = s => { let a = (s * 2654435761) >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// textures laid on by box projection in metres (every part of every prop at the same scale, no stretching)
export function boxUV(g, tile) {
  const P = g.attributes.position, N = g.attributes.normal, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i)), x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

const M = new Matrix4(), Q = new Quaternion(), E = new Euler(), S = new Vector3(), Tv = new Vector3();
/** A prop under construction: shapes added per material slot, merged at the end. */
export class Build {
  constructor() { this.slots = new Map(); }
  add(slot, geo, at, rot, scale) {
    at ||= [0, 0, 0]; rot ||= [0, 0, 0]; scale ||= [1, 1, 1];
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.morphAttributes = {}; g.clearGroups();
    M.compose(Tv.set(...at), Q.setFromEuler(E.set(...rot)), S.set(...scale)); g.applyMatrix4(M);
    if (!this.slots.has(slot)) this.slots.set(slot, []);
    this.slots.get(slot).push(g);
    return this;
  }
  box(slot, w, h, d, at, rot, r = 0) { return this.add(slot, r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * .999) : new BoxGeometry(w, h, d), at, rot); }
  cyl(slot, rt, rb, h, at, rot, seg = 16) { return this.add(slot, new CylinderGeometry(rt, rb, h, seg), at, rot); }
  ring(slot, r, tube, at, rot = [Math.PI / 2, 0, 0], arc = Math.PI * 2) { return this.add(slot, new TorusGeometry(r, tube, 6, 24, arc), at, rot); }
  lathe(slot, pts, at, seg = 20) { return this.add(slot, new LatheGeometry(pts.map(([x, y]) => new Vector2(x, y)), seg), at); }
  ball(slot, r, at, scale) { return this.add(slot, new SphereGeometry(r, 16, 10), at, [0, 0, 0], scale); }
}

// the props: each fills a Build from (b, r: random 0..1, k: options) and names its slots' materials
const PROPS = {
  crate: { slots: { boards: ['planks'], frame: ['wood', { dark: '#4a2e16' }] }, make(b, r, k) {
    const s = k.size ?? .8, f = s * .09;
    b.box('boards', s - f * .6, s - f * .6, s - f * .6, [0, s / 2, 0], 0, .01);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('frame', f, s, f, [x * (s - f) / 2, s / 2, z * (s - f) / 2], 0, .008);
    for (const y of [f / 2, s - f / 2]) for (const [x, z, w, d] of [[0, -1, s, f], [0, 1, s, f], [-1, 0, f, s], [1, 0, f, s]]) b.box('frame', w, f, d, [x * (s - f) / 2, y, z * (s - f) / 2], 0, .008);
    for (const z of [-1, 1]) b.box('frame', f * .8, s * 1.25, f * .5, [0, s / 2, z * (s / 2)], [0, 0, Math.PI / 4], .006);   // the cross brace
  } },
  barrel: { slots: { staves: ['wood', { colour: '#8a5a32' }], hoops: ['metal', { colour: '#3a3836' }] }, make(b, r, k) {
    const h = k.size ?? 1, R = h * .3, bulge = R * 1.14, pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([R + (bulge - R) * Math.sin(t * Math.PI), t * h]); }
    b.lathe('staves', [[0, 0], ...pts, [0, h]]);
    for (const t of [.08, .3, .7, .92]) b.ring('hoops', R + (bulge - R) * Math.sin(t * Math.PI) + .006, .012, [0, t * h, 0]);
  } },
  drum: { slots: { body: ['paint', { colour: '#2d5a8a' }] }, make(b, r, k) {
    const h = k.size ?? .9, R = h * .32;
    b.cyl('body', R, R, h, [0, h / 2, 0], 0, 24);
    for (const t of [0.02, .33, .66, .98]) b.ring('body', R + .004, .014, [0, t * h, 0]);
  } },
  pallet: { slots: { wood: ['wood', { colour: '#b08858' }] }, make(b, r) {
    for (let i = 0; i < 7; i++) b.box('wood', .14, .02, 1.2, [-.48 + i * .16, .13, 0], [0, (r() - .5) * .02, 0], .004);
    for (const x of [-.48, 0, .48]) for (const z of [-.5, 0, .5]) b.box('wood', .12, .08, .14, [x, .06, z], 0, .006);
    for (const z of [-.5, 0, .5]) b.box('wood', 1.1, .02, .14, [0, .01, z], 0, .004);
  } },
  table: { slots: { wood: ['wood'] }, make(b, r, k) {
    const w = k.size ?? 1.2, d = w * .6, h = .75;
    b.box('wood', w, .05, d, [0, h - .025, 0], 0, .012);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('wood', .06, h - .05, .06, [x * (w / 2 - .08), (h - .05) / 2, z * (d / 2 - .08)], 0, .01);
    b.box('wood', w - .2, .08, .03, [0, h - .09, d / 2 - .08]).box('wood', w - .2, .08, .03, [0, h - .09, -(d / 2 - .08)]);
  } },
  chair: { slots: { wood: ['wood'] }, make(b) {
    b.box('wood', .44, .04, .42, [0, .45, 0], 0, .01);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('wood', .04, z < 0 ? .95 : .45, .04, [x * .19, (z < 0 ? .95 : .45) / 2, z * .18], 0, .008);
    for (const y of [.62, .78, .9]) b.box('wood', .38, .05, .025, [0, y, -.18], 0, .006);
  } },
  bench: { slots: { slats: ['wood', { colour: '#9a6b3f' }], legs: ['metal', { colour: '#2c2e30' }] }, make(b, r, k) {
    const w = k.size ?? 1.6;
    for (let i = 0; i < 3; i++) b.box('slats', w, .035, .1, [0, .45, -.12 + i * .12], 0, .008);
    for (let i = 0; i < 2; i++) b.box('slats', w, .1, .03, [0, .62 + i * .14, -.22], [-.15, 0, 0], .008);
    for (const x of [-1, 1]) { b.box('legs', .05, .44, .36, [x * (w / 2 - .15), .22, 0], 0, .01); b.box('legs', .05, .45, .04, [x * (w / 2 - .15), .66, -.24], [-.15, 0, 0], .01); }
  } },
  shelf: { slots: { wood: ['planks', { colour: '#b48a5a' }] }, make(b, r, k) {
    const h = k.size ?? 1.8, w = .9, d = .32;
    for (const x of [-1, 1]) b.box('wood', .03, h, d, [x * (w / 2 - .015), h / 2, 0], 0, .006);
    for (let i = 0; i < 5; i++) b.box('wood', w - .06, .025, d - .01, [0, .05 + i * (h - .1) / 4, 0], 0, .004);
    b.box('wood', w, h, .012, [0, h / 2, -d / 2 + .006]);
  } },
  lamp: { slots: { pole: ['paint', { colour: '#26302a', under: '#4a4038' }], bulb: null }, make(b, r, k) {
    const h = k.size ?? 3.4;
    b.cyl('pole', .07, .1, .5, [0, .25, 0]).cyl('pole', .045, .06, h, [0, h / 2, 0], 0, 12);
    b.cyl('pole', .025, .025, .5, [0, h - .05, .22], [Math.PI / 2, 0, 0], 8);
    b.cyl('pole', .05, .18, .16, [0, h - .1, .45], 0, 16);
    b.ball('bulb', .07, [0, h - .2, .45], [1, .6, 1]);
  } },
  fence: { slots: { wood: ['wood', { colour: '#8a7058' }] }, make(b, r, k) {
    const w = k.size ?? 2;
    for (const x of [-1, 1]) b.box('wood', .09, 1.1, .09, [x * w / 2, .55, 0], 0, .012);
    for (const y of [.3, .8]) b.box('wood', w, .08, .04, [0, y, .06], 0, .008);
    const n = Math.round(w / .16);
    for (let i = 0; i < n; i++) { const hh = .95 + (r() - .5) * .06; b.box('wood', .11, hh, .022, [-w / 2 + (i + .5) * w / n, hh / 2 + .02, .095], [0, 0, (r() - .5) * .03], .004); }
  } },
  sign: { slots: { post: ['wood'], board: ['paint', { colour: '#c8a030', under: '#8a7a68' }] }, make(b, r, k) {
    b.box('post', .08, 1.5, .08, [0, .75, 0], 0, .01);
    b.box('board', k.size ?? .9, .5, .04, [0, 1.3, .06], [0, 0, (r() - .5) * .06], .01);
  } },
  bucket: { slots: { tin: ['metal', { colour: '#9aa0a4' }] }, make(b) {
    b.lathe('tin', [[0, 0], [.12, 0], [.12, .01], [.15, .3], [.155, .31], [.145, .31], [.115, .02], [0, .02]]);
    b.ring('tin', .15, .005, [0, .32, 0], [0, 0, 0], Math.PI);
  } },
  sack: { slots: { cloth: ['fabric', { colour: '#a89470' }] }, make(b, r) {
    b.ball('cloth', .28, [0, .26, 0], [1, .95, .8 + r() * .1]);
    b.ball('cloth', .12, [0, .54, 0], [.8, 1, .8]);
    b.ring('cloth', .07, .02, [0, .5, 0]);
  } },
  chest: { slots: { wood: ['planks', { colour: '#8a5a32' }], bands: ['metal', { colour: '#4a4440' }] }, make(b) {
    b.box('wood', .8, .4, .5, [0, .2, 0], 0, .01);
    b.add('wood', new CylinderGeometry(.25, .25, .8, 16, 1, false, 0, Math.PI), [0, .4, 0], [0, 0, Math.PI / 2]);
    for (const x of [-.3, .3]) { b.box('bands', .05, .41, .52, [x, .2, 0], 0, .005); b.add('bands', new CylinderGeometry(.262, .262, .05, 16, 1, false, 0, Math.PI), [x, .4, 0], [0, 0, Math.PI / 2]); }
    b.box('bands', .1, .12, .03, [0, .36, .26], 0, .006);
  } },
  cone: { slots: { plastic: ['paint', { colour: '#e8641c', under: '#f2f0ea' }] }, make(b) {
    b.box('plastic', .38, .03, .38, [0, .015, 0], 0, .02);
    b.lathe('plastic', [[0, .03], [.14, .03], [.03, .7], [0, .7]]);
  } },
  bin: { slots: { body: ['metal', { colour: '#5a6a5a' }] }, make(b) {
    b.lathe('body', [[0, 0], [.22, 0], [.26, .9], [.25, .9], [.21, .02], [0, .02]], [0, 0, 0], 24);
    b.lathe('body', [[0, .96], [.28, .9], [.28, .89], [0, .89]], [0, 0, 0], 24);
    b.ring('body', .06, .012, [0, .97, 0], [0, 0, 0], Math.PI);
  } },
  door: { slots: { frame: ['wood', { colour: '#5a3a1f' }], panel: ['planks', { colour: '#7a5a3a' }], knob: ['metal', { colour: '#b08a3a' }] }, make(b) {
    b.box('frame', .1, 2.2, .14, [-.5, 1.1, 0], 0, .01).box('frame', .1, 2.2, .14, [.5, 1.1, 0], 0, .01).box('frame', 1.1, .1, .14, [0, 2.15, 0], 0, .01);
    b.box('panel', .9, 2.1, .05, [0, 1.05, 0], 0, .006);
    b.ball('knob', .03, [.36, 1, .05]);
  } },
  pipe: { slots: { iron: ['rust'] }, make(b, r, k) {
    const l = k.size ?? 2;
    b.cyl('iron', .1, .1, l, [0, .1, 0], [0, 0, Math.PI / 2], 16);
    for (const x of [-1, 1]) b.cyl('iron', .14, .14, .04, [x * (l / 2 - .02), .1, 0], [0, 0, Math.PI / 2], 16);
  } },
};
export const PROP_NAMES = Object.keys(PROPS);

const shared = new Map();   // materials shared by every prop asking for the same recipe and colours
const matFor = (spec, colour, slot, first) => {
  const [name, look = {}] = spec, o = { ...look };
  if (first && colour) o.colour = colour;   // the maker's colour goes on the prop's main material
  const key = name + JSON.stringify(o);
  if (!shared.has(key)) shared.set(key, material(name, o));
  return shared.get(key);
};

/**
 * A prop: 'crate' | 'barrel' | 'drum' | 'pallet' | 'table' | 'chair' | 'bench' | 'shelf' | 'lamp' |
 * 'fence' | 'sign' | 'bucket' | 'sack' | 'chest' | 'cone' | 'bin' | 'door' | 'pipe'. Options: seed (small
 * differences), size (its main measure in metres), colour (its main material), wear (options for
 * gs.models.wear, or false: new), tile (metres per texture repeat, 1), lit (lamp: how bright, 2).
 * The same prop asked for again (same options) is a copy sharing its shapes and materials: no making cost,
 * and copies that keep still merge into one draw.
 */
const made = new Map();   // finished props by everything that shapes them: copies share geometry and materials
export function prop(name, o = {}) {
  const P = PROPS[name];
  if (!P) throw new Error(`gs.models.prop: no prop '${name}' (try ${PROP_NAMES.join(', ')})`);
  const { seed = 0, colour = o.color, wear: w = {}, tile = 1, lit = 2 } = o;
  const key = JSON.stringify([name, seed, colour, w, tile, lit, o.size]);
  let parts = made.get(key);
  if (!parts) {
    pause('Models');   // (while a card loads, a frame may go by before each new prop: slices.js)
    const r = rngOf(seed + 1), b = new Build(); let first = true; parts = [];
    P.make(b, r, o);
    for (const [slot, spec] of Object.entries(P.slots)) {
      const geos = b.slots.get(slot); if (!geos) continue;
      const g = boxUV(mergeGeometries(geos, false), tile); for (const x of geos) x.dispose();
      const m = new Mesh(g, spec ? matFor(spec, colour, slot, first) : pbr('#fff0c8', { glow: lit, rough: .4 }));
      if (spec) { first = false; if (w !== false) wear(m, { seed, ...w }); }
      parts.push({ slot, geo: m.geometry, mat: m.material, shadow: !!spec });
    }
    if (made.size >= 96 && !loading()) made.delete(made.keys().next().value);   // (a loading card keeps all it has made: it is asked for them again next pass)
    made.set(key, parts); built();
  }
  const out = new Group(); out.name = 'prop:' + name; out.userData.prop = name;
  for (const p of parts) { const m = new Mesh(p.geo, p.mat); m.castShadow = p.shadow; m.receiveShadow = true; m.name = p.slot; out.add(m); }
  return out;
}
