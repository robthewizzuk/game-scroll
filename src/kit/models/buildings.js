// gs.models.building(options): a close-up building from a small shape grammar, the way procedural
// building tools split a lot: the block into floors, each wall into bays, each bay into a window (a
// real opening: reveal, frame, sill, glass set back) or the door; string course, cornice, and a flat
// roof with a parapet or a gable roof. Walls, trim, frames and roof are the material recipes, aged with
// wear(). For a whole made-up town far off, gs.city is cheaper; this is for the buildings the player
// walks up to. A building that can be broken is the same grammar cut into the pieces that hold each
// other up (buildingPieces(), for gs.destruction.Structure).
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
  plaster: { wall: ['concrete', { colour: '#e3d3ae' }], trim: ['concrete', { colour: '#f4ecdc' }], frame: ['wood', { colour: '#5a3a1f' }], roof: ['concrete', { colour: '#6a6660' }], door: ['planks', { colour: '#7a4a2a' }], kind: 'flat', floor: 3.1, bay: 2.8, win: [1.1, 1.5], strength: 1.2, span: 1 },
  concrete: { wall: ['concrete'], trim: ['concrete', { colour: '#8a8882' }], frame: ['metal', { colour: '#3a3e42' }], roof: ['concrete', { colour: '#5a5a58' }], door: ['metal', { colour: '#4a5058' }], slab: ['concrete', { colour: '#7c7b76' }], kind: 'flat', floor: 3.4, bay: 3.2, win: [2.4, 1.9] },
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
 * windows glowing, 0), colour (the walls), door (false: no door), seed, wear (wear() options or false),
 * materials ({ wall, trim, frame, roof, door, glass, lit, floor }: your own three.js materials in place of
 * the style's, any of them).
 * A Group, one mesh per material, centred on x and z with its foot at y = 0 and its door facing +z. The
 * same options again give a copy sharing shapes and materials. One that can be knocked down:
 * gs.destruction.Structure.
 */
export function building(o = {}) {
  const { st, key, a } = plan(o);
  let parts = made.get(key);
  if (!parts) {
    pause('Models');   // (while a card loads, a frame may go by before each new building: slices.js)
    parts = make(st, a); keep(key, parts); built();
  }
  const out = new Group(); out.name = 'building'; out.userData.building = o.style || 'custom';
  for (const p of parts) { const m = new Mesh(p.geo, p.mat); m.castShadow = p.shadow; m.receiveShadow = true; m.name = p.slot; out.add(m); }
  return out;
}
/**
 * (Kit: gs.destruction.Structure.) The same building cut into the pieces that hold each other up: every
 * pier of a wall in two, the wall under and over each window, each window and door, the parapet a bay at a
 * time, the roof in panels and the gable ends in slices; and, only here, a floor in tiles at every storey,
 * so a broken house shows its rooms. Gives { parts: [{ slot, geo, mat, shadow }] (as building() draws them),
 * chunks: [{ kind: 'wall' | 'window' | 'door' | 'roof' | 'floor' | 'base', boxes: [{ slot, at, size, rot }],
 * ranges: [[part, first vertex, vertices]...] }], strength (of a wall piece), span (how far a piece can hang
 * out sideways from what holds it), recipes (what each slot is made of), size }. Kept by its options: read only.
 */
export function buildingPieces(o = {}) {
  const { st, key, a } = plan(o), k = key + '|cut';
  let cut = made.get(k);
  if (!cut) { pause('Models'); cut = make(st, a, true); keep(k, cut); built(); }
  return cut;
}
const made = new Map(), mats = new Map();
const keep = (key, v) => { if (made.size >= 32 && !loading()) made.delete(made.keys().next().value); made.set(key, v); };
const matOf = (spec, colour) => { const [n, look = {}] = spec, o = { ...look, ...(colour ? { colour } : {}) }, k = n + JSON.stringify(o); if (!mats.has(k)) mats.set(k, material(n, o)); return mats.get(k); };
// the options filled in from the style, and the key a building is kept under
function plan(o) {
  const st = typeof o.style === 'object' ? o.style : BUILDING_STYLES[o.style || 'brick'];
  if (!st) throw new Error(`gs.models.building: no style '${o.style}' (try ${Object.keys(BUILDING_STYLES).join(', ')})`);
  const { w = 8, d = 6, floors = 2, roof = st.kind, floor: fh = st.floor, bay = st.bay, win = st.win, lit = 0, colour = o.color, door = true, seed = 0, wear: wr = {}, materials: own = null } = o;
  const key = JSON.stringify([st, w, d, floors, roof, fh, bay, win, lit, colour, door, seed, wr, own && Object.entries(own).map(([k, m]) => k + m.uuid)]);
  return { st, key, a: { w, d, floors, roof, fh, bay, win, lit, colour, door, seed, wr, own } };
}
// by what the walls are made of: how hard a piece is to break, and how far one can hang out sideways
const HOLD = { planks: [.8, 2], wood: [.8, 2], brick: [1.5, 1], stone: [2, 1], concrete: [2.5, 2], metal: [3, 3] };

function make(st, { w, d, floors, roof, fh, bay, win, lit, colour, door, seed, wr, own }, cut = false) {
  const b = new Build(), r = rngOf(seed + 11), rc = rngOf(seed + 23), t = .3, H = floors * fh, [ww, wh] = win;
  // cut (a building to break): each shape is noted against the piece of the building it is part of
  const chunks = [], tags = new Map(); let cur = -1;
  const piece = kind => cut ? (chunks.push({ kind, boxes: [], ranges: [] }), cur = chunks.length - 1) : -1;
  const note = (slot, box) => { if (!cut) return; if (!tags.has(slot)) tags.set(slot, []); tags.get(slot).push(cur); chunks[cur].boxes.push({ slot, rot: null, ...box }); };
  const box = (slot, sx, sy, sz, at, rot) => { b.box(slot, sx, sy, sz, at, rot); note(slot, { at, size: [sx, sy, sz], rot: rot || null }); };
  const run = (f, past) => f.L + (f.front || f.n[1] < 0 ? 0 : 2 * t) + past;   // a trim's length: the side walls sit between the front and back
  // a box in a wall's own frame (a along it, y up, out from its outer face), turned into place
  const put = (slot, a, L, y0, h, out0, out1, f) => {
    const cx = f.c[0] + f.u[0] * a + f.n[0] * (out0 + out1) / 2, cz = f.c[1] + f.u[1] * a + f.n[1] * (out0 + out1) / 2, depth = out1 - out0;
    const along = Math.abs(f.u[0]) > .5;
    box(slot, along ? L : depth, h, along ? depth : L, [cx, y0 + h / 2, cz]);
  };
  const nx = Math.max(1, Math.round(w / bay)), nz = Math.max(1, Math.round((d - 2 * t) / bay));   // bays across the front, and down a side
  for (const f of walls(w, d, t)) {
    const n = Math.max(1, Math.round(f.L / bay)), bw = f.L / n, spans = [];
    // a strip along the whole wall; (cut) in lengths, each with the piece of wall it is fixed to
    const strip = (slot, len, y, h, out0, out1, fl) => {
      if (!cut) return put(slot, 0, len, y, h, out0, out1, f);
      const S = spans[fl], e = (len - f.L) / 2, mid = y + h / 2;
      S.forEach((s, i) => {
        const id = mid < s.yb ? s.lo : mid >= s.yt ? s.hi : -1; if (id < 0) return;   // (across a doorway: left out)
        const a0 = s.a0 - (i ? 0 : e), a1 = s.a1 + (i === S.length - 1 ? e : 0);
        cur = id; put(slot, (a0 + a1) / 2, a1 - a0, y, h, out0, out1, f);
      });
    };
    for (let fl = 0; fl < floors; fl++) {
      const y0 = fl * fh, ground = fl === 0, S = spans[fl] = [];
      // which bays hold what: the door in the front's middle bay on the ground floor, else windows
      const holes = [];
      for (let i = 0; i < n; i++) {
        const a = -f.L / 2 + (i + .5) * bw;
        if (ground && door && f.front && i === Math.floor(n / 2)) holes.push({ a, w: Math.min(1.2, bw - .5), y: 0, h: Math.min(2.3, fh - .5), door: true });
        else holes.push({ a, w: Math.min(ww, bw - .5), y: ground ? Math.max(.5, (fh - wh) * .55) : (fh - wh) * .55, h: wh });
      }
      // the wall around the holes: piers between them ((cut) each in two, a lower and an upper half), and the pieces above and below each
      const pier = (x, l) => {
        if (!cut) return put('wall', x + l / 2, l, y0, fh, -t, 0, f);
        const ys = fh * (.38 + rc() * .24);   // (not all at one height: a break has a ragged line)
        const lo = piece('wall'); put('wall', x + l / 2, l, y0, ys, -t, 0, f);
        const hi = piece('wall'); put('wall', x + l / 2, l, y0 + ys, fh - ys, -t, 0, f);
        S.push({ a0: x, a1: x + l, lo, hi, yb: y0 + ys, yt: y0 + ys });
      };
      let x = -f.L / 2;
      for (const h of holes) {
        const l = h.a - h.w / 2 - x; if (l > 1e-3) pier(x, l);
        const s = { a0: h.a - h.w / 2, a1: h.a + h.w / 2, lo: -1, hi: -1, yb: y0 + h.y, yt: y0 + h.y + h.h }; S.push(s);
        if (h.y > 1e-3) { s.lo = piece('wall'); put('wall', h.a, h.w, y0, h.y, -t, 0, f); }
        s.hi = piece('wall'); put('wall', h.a, h.w, y0 + h.y + h.h, fh - h.y - h.h, -t, 0, f);
        x = h.a + h.w / 2;
        // in the hole: the frame and glass set back, a sill under a window, the door panel
        const yb = y0 + h.y, fw = .06, back = -.14;
        piece(h.door ? 'door' : 'window');
        put('frame', h.a, h.w, yb + h.h - fw, fw, back - .05, back + .03, f);
        for (const sd of [-1, 1]) put('frame', h.a + sd * (h.w / 2 - fw / 2), fw, yb, h.h, back - .05, back + .03, f);
        if (h.door) put('door', h.a, h.w - fw * 2, yb, h.h - fw, back - .04, back, f);
        else {
          put('frame', h.a, h.w, yb, fw, back - .05, back + .03, f);
          put('frame', h.a, fw * .7, yb + fw, h.h - fw * 2, back - .04, back + .02, f);   // the middle bar
          put(r() < lit ? 'lit' : 'glass', h.a, h.w - fw, yb + fw / 2, h.h - fw, back - .03, back - .01, f);
          put('trim', h.a, h.w + .16, yb - .06, .07, -.02, .07, f);   // sill
        }
      }
      const l = f.L / 2 - x; if (l > 1e-3) pier(x, l);
      if (floors > 1 && ground) strip('trim', run(f, .1), fh - .08, .16, -.02, .05, 0);   // string course
    }
    // the plinth along the foot and the cornice along the top (each runs past the corner: no gaps)
    strip('trim', run(f, .1), 0, .35, -.02, .05, 0);
    if (roof !== 'flat') strip('trim', run(f, .24), H - .2, .2, -.02, .12, floors - 1);
    else if (!cut) { put('trim', 0, run(f, .28), H, .22, -.02, .14, f); put('wall', 0, f.L, H + .22, .7, -t, 0, f); put('trim', 0, run(f, .08), H + .92, .08, -t - .03, .04, f); }
    else for (let i = 0; i < n; i++) {   // the parapet a bay at a time, its wall down to the wall below so it stands on it
      const seg = (slot, len, y, h, out0, out1) => { const e = (len - f.L) / 2, a0 = -f.L / 2 + i * bw - (i ? 0 : e), a1 = -f.L / 2 + (i + 1) * bw + (i === n - 1 ? e : 0); put(slot, (a0 + a1) / 2, a1 - a0, y, h, out0, out1, f); };
      piece('wall'); seg('wall', f.L, H, .92, -t, 0); seg('trim', run(f, .28), H, .22, -.02, .14); seg('trim', run(f, .08), H + .92, .08, -t - .03, .04);
    }
  }
  // (cut) a slab in tiles, two to a bay each way
  const tiles = (kind, slot, y, h) => {
    const tx = nx * 2, tz = nz * 2, sx = (w - 2 * t) / tx, sz = (d - 2 * t) / tz;
    for (let i = 0; i < tx; i++) for (let j = 0; j < tz; j++) { piece(kind); box(slot, sx, h, sz, [-(w / 2 - t) + (i + .5) * sx, y + h / 2, -(d / 2 - t) + (j + .5) * sz]); }
  };
  if (roof === 'flat') { if (cut) tiles('roof', 'roof', H - .05, .3); else box('roof', w - t * 2, .1, d - t * 2, [0, H + .2, 0]); }   // ((cut) thick enough to be built into the walls)
  else {
    // a gable roof: the ridge across the front, two sloped planes and the triangle walls at the ends
    const pitch = .62, rise = Math.tan(pitch) * d / 2, ov = .35, len = (d / 2 + ov) / Math.cos(pitch), py = H + rise / 2 - Math.sin(pitch) * ov / 2 + .06;
    const end = (sh, s) => [new ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }), [s * (w / 2 - t / 2) + t / 2, H, 0], [0, -Math.PI / 2, 0]];
    if (!cut) {
      for (const s of [-1, 1]) box('roof', w + ov * 2, .12, len, [0, py, s * (d / 4 + ov / 2 - .02)], [s * pitch, 0, 0]);
      box('trim', w + ov * 2 + .05, .14, .2, [0, H + rise + .06, 0]);   // ridge
      const tri = new Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise); tri.closePath();
      for (const s of [-1, 1]) b.add('wall', ...end(tri, s));
    } else {
      for (const s of [-1, 1]) for (let i = 0; i < nx; i++) {   // a panel a bay on each slope, the ridge in lengths with the front ones
        const x0 = -w / 2 + i * w / nx - (i ? 0 : ov), x1 = -w / 2 + (i + 1) * w / nx + (i === nx - 1 ? ov : 0);
        piece('roof'); box('roof', x1 - x0, .12, len, [(x0 + x1) / 2, py, s * (d / 4 + ov / 2 - .02)], [s * pitch, 0, 0]);
        const r0 = x0 - (i ? 0 : .025), r1 = x1 + (i === nx - 1 ? .025 : 0);
        if (s > 0) box('trim', r1 - r0, .14, .2, [(r0 + r1) / 2, H + rise + .06, 0]);
      }
      const m = 2 * Math.max(1, Math.round(nz / 2)), up = z => rise * (1 - Math.abs(z) / (d / 2));   // the end walls in upright slices
      for (const s of [-1, 1]) for (let k = 0; k < m; k++) {
        const z0 = -d / 2 + k * d / m, z1 = z0 + d / m, h0 = up(z0), h1 = up(z1), sh = new Shape();
        sh.moveTo(z0, 0); sh.lineTo(z1, 0); if (h1 > 1e-6) sh.lineTo(z1, h1); if (h0 > 1e-6) sh.lineTo(z0, h0); sh.closePath();
        piece('wall'); b.add('wall', ...end(sh, s));
        note('wall', { at: [s * (w / 2 - t / 2), H + (h0 + h1) / 4, (z0 + z1) / 2], size: [t, (h0 + h1) / 2, d / m], rough: true });   // (a box that stands in for it)
      }
    }
  }
  if (cut) {   // floors: the ground, each storey, and the ceiling under a pitched roof
    piece('base'); box('floor', w - 2 * t, .06, d - 2 * t, [0, .03, 0]);
    for (let fl = 1; fl < floors + (roof === 'flat' ? 0 : 1); fl++) tiles('floor', 'floor', fl * fh - .14, .14);
  }
  // one mesh per material, textures laid on in metres, aged
  const specs = { wall: st.wall, trim: st.trim, frame: st.frame, roof: st.roof, door: st.door, floor: st.slab || ['planks', { colour: '#8a6a4a', dark: '#5c4128' }] }, out = [];
  for (const [slot, geos] of b.slots) {
    if (cut) {   // where each piece's points are in this slot's mesh
      let v = 0;
      geos.forEach((g, i) => { const R = chunks[tags.get(slot)[i]].ranges, n = g.attributes.position.count, last = R.at(-1); if (last && last[0] === out.length && last[1] + last[2] === v) last[2] += n; else R.push([out.length, v, n]); v += n; });
    }
    const g = boxUV(mergeGeometries(geos, false), 1); for (const x of geos) x.dispose();
    const mat = own?.[slot] || (slot === 'glass' ? glass() : slot === 'lit' ? litGlass() : matOf(specs[slot], slot === 'wall' ? colour : null));
    const m = new Mesh(g, mat);
    if (wr !== false && (slot === 'wall' || slot === 'trim' || slot === 'roof')) wear(m, { seed, split: false, edges: .4, dirt: .5, ground: 1.2, ...wr });
    out.push({ slot, geo: m.geometry, mat: m.material, shadow: slot !== 'lit' && slot !== 'glass' });
  }
  if (!cut) return out;
  const hold = HOLD[st.wall?.[0]] || HOLD.brick, recipes = {}; for (const k in specs) recipes[k] = specs[k]?.[0] || '';
  return { parts: out, chunks, strength: st.strength ?? hold[0], span: st.span ?? hold[1], recipes, size: [w, H, d] };
}
let gl = null, gll = null;
const glass = () => gl ||= pbr('#141c24', { rough: .06, metal: .3 });
const litGlass = () => gll ||= pbr('#ffd9a0', { rough: .3, glow: .9 });
