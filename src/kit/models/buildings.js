// gs.models.building(options): a close-up building from a small shape grammar, the way procedural
// building tools split a lot: the block into floors, each wall into bays, each bay into a window (a
// real opening: reveal, frame, sill, glass set back) or the door; string course, cornice, and a flat
// roof with a parapet or a gable roof. Walls, trim, frames and roof are the material recipes, aged with
// wear(). For a whole made-up town far off, gs.city is cheaper; this is for the buildings the player
// walks up to.
// Kit use only: games reach it as gs.models.building.
import { pause, built, loading } from '../slices.js';
import { Group, Mesh, Shape, ExtrudeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Build, boxUV, rngOf } from './props.js';
import { material } from './materials.js';
import { wear } from './wear.js';
import { pbr } from '../hd3d.js';

export const BUILDING_STYLES = {
  brick: { wall: ['brick'], trim: ['stone', { colour: '#c8c0b0', dark: '#a49c8c' }], frame: ['paint', { colour: '#f2f0ea', under: '#c8c0b0' }], roof: ['stone', { colour: '#4a4e56', dark: '#2e3036' }], door: ['planks', { colour: '#3a5a4a', dark: '#24382e' }], kind: 'gable', floor: 3.2, bay: 2.6, win: [1.1, 1.6] },
  plaster: { wall: ['concrete', { colour: '#e3d3ae' }], trim: ['concrete', { colour: '#f4ecdc' }], frame: ['wood', { colour: '#5a3a1f' }], roof: ['concrete', { colour: '#6a6660' }], door: ['planks', { colour: '#7a4a2a' }], kind: 'flat', floor: 3.1, bay: 2.8, win: [1.1, 1.5] },
  concrete: { wall: ['concrete'], trim: ['concrete', { colour: '#8a8882' }], frame: ['metal', { colour: '#3a3e42' }], roof: ['concrete', { colour: '#5a5a58' }], door: ['metal', { colour: '#4a5058' }], kind: 'flat', floor: 3.4, bay: 3.2, win: [2.4, 1.9] },
  stone: { wall: ['stone', { colour: '#b8b0a0', dark: '#8a8476' }], trim: ['stone', { colour: '#d8d2c4', dark: '#b4aea0' }], frame: ['wood', { colour: '#4a3420' }], roof: ['stone', { colour: '#3e4048', dark: '#26282e' }], door: ['planks', { colour: '#5a3a1f' }], kind: 'gable', floor: 3.4, bay: 2.6, win: [1, 1.7] },
  timber: { wall: ['planks', { colour: '#9a5a3a', dark: '#6a3a22', gap: '#3a2010' }], trim: ['wood', { colour: '#e8e2d4', dark: '#c8c0b0' }], frame: ['wood', { colour: '#f0ebe0', dark: '#d0c8b8' }], roof: ['planks', { colour: '#4a3a30', dark: '#2a201a' }], door: ['planks', { colour: '#2e4a6a' }], kind: 'gable', floor: 2.8, bay: 2.4, win: [1, 1.2] },
};

// the four walls: centre, which way is along (u) and out (n), and length
const walls = (w, d, t) => [
  { c: [0, d / 2], u: [1, 0], n: [0, 1], L: w, front: true },
  { c: [w / 2, 0], u: [0, -1], n: [1, 0], L: d - 2 * t },
  { c: [0, -d / 2], u: [-1, 0], n: [0, -1], L: w },
  { c: [-w / 2, 0], u: [0, 1], n: [-1, 0], L: d - 2 * t },
];

/**
 * A building: style 'brick' | 'plaster' | 'concrete' | 'stone' | 'timber' (BUILDING_STYLES; or your own
 * object like them), w and d (metres across the front and deep, 8 x 6), floors (2), roof 'flat' | 'gable'
 * (the style's own), floor (storey height), bay (metres per window), win ([w, h] of a window), lit (0..1 of
 * windows glowing, 0), colour (the walls), door (false: no door), seed, wear (wear() options or false).
 * A Group, one mesh per material, centred on x and z with its foot at y = 0 and its door facing +z. The
 * same options again give a copy sharing shapes and materials.
 */
export function building(o = {}) {
  const st = typeof o.style === 'object' ? o.style : BUILDING_STYLES[o.style || 'brick'];
  if (!st) throw new Error(`gs.models.building: no style '${o.style}' (try ${Object.keys(BUILDING_STYLES).join(', ')})`);
  const { w = 8, d = 6, floors = 2, roof = st.kind, floor: fh = st.floor, bay = st.bay, win = st.win, lit = 0, colour = o.color, door = true, seed = 0, wear: wr = {} } = o;
  const key = JSON.stringify([st, w, d, floors, roof, fh, bay, win, lit, colour, door, seed, wr]);
  let parts = made.get(key);
  if (!parts) {
    pause('Models');   // (while a card loads, a frame may go by before each new building: slices.js)
    parts = make(st, { w, d, floors, roof, fh, bay, win, lit, colour, door, seed, wr }); if (made.size >= 32 && !loading()) made.delete(made.keys().next().value); made.set(key, parts); built();
  }
  const out = new Group(); out.name = 'building'; out.userData.building = o.style || 'custom';
  for (const p of parts) { const m = new Mesh(p.geo, p.mat); m.castShadow = p.shadow; m.receiveShadow = true; m.name = p.slot; out.add(m); }
  return out;
}
const made = new Map(), mats = new Map();
const matOf = (spec, colour) => { const [n, look = {}] = spec, o = { ...look, ...(colour ? { colour } : {}) }, k = n + JSON.stringify(o); if (!mats.has(k)) mats.set(k, material(n, o)); return mats.get(k); };

function make(st, { w, d, floors, roof, fh, bay, win, lit, colour, door, seed, wr }) {
  const b = new Build(), r = rngOf(seed + 11), t = .3, H = floors * fh, [ww, wh] = win;
  const run = (f, past) => f.L + (f.front || f.n[1] < 0 ? 0 : 2 * t) + past;   // a trim's length: the side walls sit between the front and back
  // a box in a wall's own frame (a along it, y up, out from its outer face), turned into place
  const put = (slot, a, L, y0, h, out0, out1, f) => {
    const cx = f.c[0] + f.u[0] * a + f.n[0] * (out0 + out1) / 2, cz = f.c[1] + f.u[1] * a + f.n[1] * (out0 + out1) / 2, depth = out1 - out0;
    const along = Math.abs(f.u[0]) > .5;
    b.box(slot, along ? L : depth, h, along ? depth : L, [cx, y0 + h / 2, cz]);
  };
  for (const f of walls(w, d, t)) {
    const n = Math.max(1, Math.round(f.L / bay)), bw = f.L / n;
    for (let fl = 0; fl < floors; fl++) {
      const y0 = fl * fh, ground = fl === 0;
      // which bays hold what: the door in the front's middle bay on the ground floor, else windows
      const holes = [];
      for (let i = 0; i < n; i++) {
        const a = -f.L / 2 + (i + .5) * bw;
        if (ground && door && f.front && i === Math.floor(n / 2)) holes.push({ a, w: Math.min(1.2, bw - .5), y: 0, h: Math.min(2.3, fh - .5), door: true });
        else holes.push({ a, w: Math.min(ww, bw - .5), y: ground ? Math.max(.5, (fh - wh) * .55) : (fh - wh) * .55, h: wh });
      }
      // the wall around the holes: piers between them, and the pieces above and below each
      let x = -f.L / 2;
      for (const h of holes) {
        const l = h.a - h.w / 2 - x; if (l > 1e-3) put('wall', x + l / 2, l, y0, fh, -t, 0, f);
        if (h.y > 1e-3) put('wall', h.a, h.w, y0, h.y, -t, 0, f);
        put('wall', h.a, h.w, y0 + h.y + h.h, fh - h.y - h.h, -t, 0, f);
        x = h.a + h.w / 2;
        // in the hole: the frame and glass set back, a sill under a window, the door panel
        const yb = y0 + h.y, fw = .06, back = -.14;
        put('frame', h.a, h.w, yb + h.h - fw, fw, back - .05, back + .03, f);
        for (const s of [-1, 1]) put('frame', h.a + s * (h.w / 2 - fw / 2), fw, yb, h.h, back - .05, back + .03, f);
        if (h.door) put('door', h.a, h.w - fw * 2, yb, h.h - fw, back - .04, back, f);
        else {
          put('frame', h.a, h.w, yb, fw, back - .05, back + .03, f);
          put('frame', h.a, fw * .7, yb + fw, h.h - fw * 2, back - .04, back + .02, f);   // the middle bar
          put(r() < lit ? 'lit' : 'glass', h.a, h.w - fw, yb + fw / 2, h.h - fw, back - .03, back - .01, f);
          put('trim', h.a, h.w + .16, yb - .06, .07, -.02, .07, f);   // sill
        }
      }
      const l = f.L / 2 - x; if (l > 1e-3) put('wall', x + l / 2, l, y0, fh, -t, 0, f);
      if (floors > 1 && ground) put('trim', 0, run(f, .1), fh - .08, .16, -.02, .05, f);   // string course
    }
    // the plinth along the foot and the cornice along the top (each runs past the corner: no gaps)
    put('trim', 0, run(f, .1), 0, .35, -.02, .05, f);
    if (roof === 'flat') { put('trim', 0, run(f, .28), H, .22, -.02, .14, f); put('wall', 0, f.L, H + .22, .7, -t, 0, f); put('trim', 0, run(f, .08), H + .92, .08, -t - .03, .04, f); }
    else put('trim', 0, run(f, .24), H - .2, .2, -.02, .12, f);
  }
  if (roof === 'flat') b.box('roof', w - t * 2, .1, d - t * 2, [0, H + .2, 0]);
  else {
    // a gable roof: the ridge across the front, two sloped planes and the triangle walls at the ends
    const pitch = .62, rise = Math.tan(pitch) * d / 2, ov = .35, len = (d / 2 + ov) / Math.cos(pitch);
    for (const s of [-1, 1]) b.box('roof', w + ov * 2, .12, len, [0, H + rise / 2 - Math.sin(pitch) * ov / 2 + .06, s * (d / 4 + ov / 2 - .02)], [s * pitch, 0, 0]);
    b.box('trim', w + ov * 2 + .05, .14, .2, [0, H + rise + .06, 0]);   // ridge
    const tri = new Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise); tri.closePath();
    for (const s of [-1, 1]) b.add('wall', new ExtrudeGeometry(tri, { depth: t, bevelEnabled: false }), [s * (w / 2 - t / 2) - t / 2, H, 0], [0, -Math.PI / 2, 0]);
  }
  // one mesh per material, textures laid on in metres, aged
  const specs = { wall: st.wall, trim: st.trim, frame: st.frame, roof: st.roof, door: st.door }, out = [];
  for (const [slot, geos] of b.slots) {
    const g = boxUV(mergeGeometries(geos, false), 1); for (const x of geos) x.dispose();
    const mat = slot === 'glass' ? glass() : slot === 'lit' ? litGlass() : matOf(specs[slot], slot === 'wall' ? colour : null);
    const m = new Mesh(g, mat);
    if (wr !== false && (slot === 'wall' || slot === 'trim' || slot === 'roof')) wear(m, { seed, split: false, edges: .4, dirt: .5, ground: 1.2, ...wr });
    out.push({ slot, geo: m.geometry, mat: m.material, shadow: slot !== 'lit' && slot !== 'glass' });
  }
  return out;
}
let gl = null, gll = null;
const glass = () => gl ||= pbr('#141c24', { rough: .06, metal: .3 });
const litGlass = () => gll ||= pbr('#ffd9a0', { rough: .3, glow: .9 });
