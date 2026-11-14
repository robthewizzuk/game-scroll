// Cloth in the wind (gs.outdoors.Cloth): flags, banners, awnings and washing lines that the wind lifts, ripples and
// snaps, that sag under their own weight and settle when it drops. A piece is a sheet of points joined to their
// neighbours (along, across, corner to corner and two along, so it keeps its size, its shear and some stiffness),
// stepped a few small steps a frame (XPBD with substeps: Macklin et al. 2019, steady at any stiffness). The wind
// pushes each part of the sheet by how square it meets it, as air does a sail, and is never quite steady: gusts
// from a gs.outdoors Wind, and a flutter that runs along the cloth. On WebGPU the graphics chip runs every piece in
// one pass and draws it from there (cloth-gpu.js, finer sheets); elsewhere the same steps run here, coarser.
//
//   const { Cloth, Wind } = gs.outdoors;
//   make() { wind = new Wind({ x: 5, z: 2 }); cloth = new Cloth(view, { wind });
//            cloth.flag({ at: [0, 6, 0], size: [1.8, 1.2], colours: ['#c33', '#fff', '#36c'] });   // stripes from the pole out
//            cloth.awning({ at: [4, 2.6, -3], width: 3, depth: 1.4, colours: ['#2a6', '#eee'] });
//            cloth.banner({ from: [-3, 4, -2], to: [-1, 4, -2], drop: 2.2, colour: '#824' });
//            cloth.line({ from: [-6, 2, 2], to: [-1, 2.1, 3], items: 4 }); }
//   update(dt) { wind.update(dt); cloth.update(dt); }
//
// Everything is in metres. A piece's pins can ride a moving thing (flag.ride(boat)), and cloth.ball / cloth.capsule
// are solid things it drapes over and is pushed aside by. With world: a gs.physics3d World3D, the bodies near the cloth
// are such solids by themselves (a ball rolled into the washing, a kart through a banner, a crate under a sheet).
import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { webgpu } from './gpu.js';
import { own } from './cleanup.js';
import { timed } from './prof.js';

const GRAV = -9.81, AIR = .6, SKIN = .12, GRIP = .6, MOVE = .01;
// a direction turned by a quaternion { x, y, z, w }
const turn = (q, v) => { const [x, y, z] = v, ix = q.w * x + q.y * z - q.z * y, iy = q.w * y + q.z * x - q.x * z, iz = q.w * z + q.x * y - q.y * x, iw = -q.x * x - q.y * y - q.z * z; return [ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x]; };
// (AIR: half the density of air: a sheet square to a wind of v metres a second is pushed AIR v² newtons a square metre. SKIN: what the wind
// along a cloth that flaps drags it by, against that: a flag's drag is about an eighth of a board's square on, which is what flies it)
const STEPS = 4;   // small steps a frame
// how stiff each kind of link is (XPBD compliance, m/N: 0 never gives) and how hard it holds
const LINK = { along: 0, shear: .5, bend: 1 };   // (cloth hardly stretches, but shears and folds easily: that's why a flag hangs in still air)
export const PIECES_MAX = 64;   // pieces the graphics chip's wind table holds
export const SOLIDS_MAX = 32;   // solid things it goes round there
const PAD = .02;   // (a body's rods stand this far proud of the clothes: the cloth's points keep off them, and so the sheet between them mostly does too)
// a person's body as rods: [bone, a place on it, bone, a place on it, radius there, radius at the other end] (places in metres from the bone, as
// the body stands; the radii are a clothed body's, so cloth lies on the clothes rather than in them): the trunk as two
// side by side (it is wider than it is deep), the thighs, the shins, the upper arms and the forearms, and the seat across the tops of the legs
// (cloth's points alone would slip up between them)
const BODY = [
  ['hips', [.07, .06, -.01], 'spine', [.075, .28, -.015], .11, .11], ['hips', [-.07, .06, -.01], 'spine', [-.075, .28, -.015], .11, .11],
  ['legL', [0, -.04, 0], 'shinL', [0, .03, 0], .117, .078], ['legR', [0, -.04, 0], 'shinR', [0, .03, 0], .117, .078], ['legL', [-.01, .0, -.005], 'legR', [.01, .0, -.005], .122, .122],
  ['shinL', [0, 0, 0], 'footL', [0, .03, 0], .074, .055], ['shinR', [0, 0, 0], 'footR', [0, .03, 0], .074, .055],
  ['armL', [0, -.02, 0], 'foreL', [0, 0, 0], .058, .046], ['armR', [0, -.02, 0], 'foreR', [0, 0, 0], .058, .046],
  ['foreL', [0, 0, 0], 'handL', [0, -.07, 0], .046, .036], ['foreR', [0, 0, 0], 'handR', [0, -.07, 0], .046, .036],
];

// a wind that is never quite steady: gusts, and a sideways wobble that runs downwind along the cloth (a flag's ripples run at about two
// thirds of the wind's speed). u: how far downwind the point is, y its height, sp the wind's speed. Shared with the graphics chip's version.
const FL = { k: 2.2, c0: 2.5, c1: 1.1, ky: 1.3, gust: .3, side: .28 };

class Piece {
  constructor(cloth, kind, cols, rows, place, { colour = '#c33', colours = null, across = false, weight = .15, pins = [], joins = [], stiff = 1, open = 1, loop = false, carry = 0, arms = true } = {}) {
    Object.assign(this, { cloth, kind, cols, rows, weight, stiff, open, loop, carry, arms });
    // (arms: false goes through people's arms (a skirt: a hand at the side would only push it into the hips); 'upper' only goes round the upper arms
    // (a cape: it lies on them, and a forearm swinging back would hook its edge over the elbow). skips: the arm rods it goes through, 1 forearms, 2 all)
    this.skips = arms === false ? 2 : arms === 'upper' ? 1 : 0;
    this.rv = [0, 0, 0]; this.rp = null;   // (how fast what it rides is going, and where it was: the air round a body goes along with it, carry of it)   // (loop: its last column joins its first, all round: a skirt)
    this.place = place; this.pinList = pins; this.joinList = joins; this.base = 0;
    this.colours = (colours || [colour]).map(c => new Color(c)); this.across = across;
    this.rider = null; this.local = null; this.gone = false; this.wind = [0, 0, 0, 0];   // (x, y, z and its speed)
  }
  /** The point at column i, row j: [x, y, z] (now). */
  at(i, j) { if (this.cloth.dirty) this.cloth.build(); const P = this.cloth.P, k = (this.base + j * this.cols + i) * 3; return [P[k], P[k + 1], P[k + 2]]; }
  /** Pins ride a moving thing (an Object3D: a boat, a car, a person): they keep their place on it. null: they stay where they are. */
  ride(thing) {
    this.rider = thing; this.local = null; this.rp = null; this.pm = null; this.rv.fill(0); if (this.cloth.dirty) this.cloth.build();
    if (thing) { thing.updateWorldMatrix(true, false); this.pm = thing.matrixWorld.clone(); const inv = new Matrix4().copy(thing.matrixWorld).invert(), A = this.cloth.A; this.local = this.pinList.map(p => { const k = (this.base + p) * 3; return new Vector3(A[k], A[k + 1], A[k + 2]).applyMatrix4(inv); }); }
    return this;
  }
  /** Moves its pins by (dx, dy, dz) metres (the cloth follows). */
  move(dx, dy, dz) { if (this.cloth.dirty) this.cloth.build(); const A = this.cloth.A; for (const p of this.pinList) { const k = (this.base + p) * 3; A[k] += dx; A[k + 1] += dy; A[k + 2] += dz; } this.cloth.pinsMoved = true; return this; }
  /** Takes it away. */
  remove() { this.gone = true; this.cloth.pieces = this.cloth.pieces.filter(p => p !== this); this.cloth.dirty = true; }
}

export class Cloth {
  /**
   * view: an HDView (null: the numbers alone). wind: a gs.outdoors Wind, or { x, y, z } metres a second (a breeze of 3 by
   * default). fine: points across a metre (WebGPU 14, else 7). ground: a height (or (x, z) => height) the cloth lies on rather than going through.
   */
  constructor(view, { wind = null, fine = null, ground = null, rough = .85, steps = STEPS, world = null } = {}) {
    this.view = view; this.wind = wind; this.ground = ground; this.t = 0; this.steps = steps; this.world = world; this.felt = new Map();
    this.big = !!webgpu() && typeof view?.envFor === 'function' && typeof webgpu().fx?.gpuCloth === 'function';
    this.fine = fine ?? (this.big ? 14 : 7);
    this.pieces = []; this.solids = []; this.bodies = []; this.dirty = true; this.pinsMoved = false;
    this.N = 0; this.P = new Float32Array(0);
    this.mat = new MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, side: DoubleSide });
    this.mesh = new Mesh(new BufferGeometry(), this.mat); this.mesh.castShadow = this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; this.mesh.name = 'cloth';
    Object.assign(this.mesh.userData, { noLod: true, detail: false, noOcclude: true });   // (its points move every frame: no simpler far copies, cluster detail or hiding behind things by stale bounds)
    this.twin = null; this.mode = 'cpu'; this.pending = 0;
    if (view) { (view.sims ||= []).push(this); (view.scene || view).add?.(this.mesh); }
    own(this);
  }
  // how many points along a length (at least 2)
  n(len, most = 40) { return Math.max(2, Math.min(most, Math.round(len * this.fine) + 1)); }
  // (worn pieces: at least twelve a metre whatever fine is, as they wrap round limbs about a hand wide; coarser, a thigh shows through between points)
  nw(len, most = 40) { return Math.max(this.n(len, most), Math.min(most, Math.round(len * 12) + 1)); }
  add(p) { this.pieces.push(p); this.dirty = true; return p; }

  /**
   * A flag on a pole: at, the top of its edge on the pole; size [across, down] metres; dir: the way it flies out at rest (radians about up, 0 = +x).
   * colour, or colours: stripes (along it from the pole, or across: true, from the top down); weight: kilograms a square metre (.15: nylon; .4: canvas).
   */
  flag({ at = [0, 5, 0], size = [1.5, 1], dir = 0, ...o } = {}) {
    const [w, h] = size, c = this.n(w), r = this.n(h), dx = Math.cos(dir), dz = -Math.sin(dir);
    const pins = []; for (let j = 0; j < r; j++) pins.push(j * c);
    return this.add(new Piece(this, 'flag', c, r, (i, j) => [at[0] + dx * w * i / (c - 1), at[1] - h * j / (r - 1), at[2] + dz * w * i / (c - 1)], { ...o, pins }));
  }
  /** A banner hung from a rail: from, to (the rail's ends), drop (metres it hangs). Pinned all along the top; the bottom is free. */
  banner({ from = [0, 3, 0], to = [1, 3, 0], drop = 2, ...o } = {}) {
    const w = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]), c = this.n(w), r = this.n(drop), pins = []; for (let i = 0; i < c; i++) pins.push(i);
    return this.add(new Piece(this, 'banner', c, r, (i, j) => { const u = i / (c - 1); return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u - drop * j / (r - 1), from[2] + (to[2] - from[2]) * u]; }, { across: true, weight: .3, ...o, pins }));
  }
  /**
   * An awning over a door or a window: at, the middle of where it meets the wall; width; depth (how far out it comes); fall (how far its front
   * is below the wall's edge); dir: the way it comes out from the wall (radians about up, 0 = +z); valance: the strip that hangs from the front
   * (metres). Its frame holds it at the wall and along the front bar; between them it sags a little, and the valance flaps.
   */
  awning({ at = [0, 2.5, 0], width = 2.5, depth = 1.2, fall = .45, dir = 0, valance = .22, ...o } = {}) {
    const c = this.n(width), rd = this.n(Math.hypot(depth, fall)), rv = Math.max(2, this.n(valance, 8)), r = rd + rv - 1;
    const ox = Math.sin(dir), oz = Math.cos(dir), sx = Math.cos(dir), sz = -Math.sin(dir), pins = [];
    for (let i = 0; i < c; i++) pins.push(i, (rd - 1) * c + i);
    return this.add(new Piece(this, 'awning', c, r, (i, j) => {
      const s = (i / (c - 1) - .5) * width; let out, down;
      if (j < rd) { const u = j / (rd - 1); out = depth * u; down = fall * u; } else { out = depth; down = fall + valance * (j - rd + 1) / (rv - 1); }
      return [at[0] + sx * s + ox * out, at[1] - down, at[2] + sz * s + oz * out];
    }, { colours: o.colours || ['#2a7a4a', '#eeeae0'], weight: .4, ...o, pins }));
  }
  /**
   * A washing line between two posts: from, to; sag (metres it dips in the middle); items: how many things hang from it, or a list of
   * { at: 0..1 along it, size: [w, h], colour }. Each is pegged at its top corners and middle, and the line gives under them.
   */
  line({ from = [0, 2, 0], to = [3, 2, 0], sag = .12, items = 3, colour = '#ddd', ...o } = {}) {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]), c = this.n(len, 60);
    const rope = this.add(new Piece(this, 'rope', c, 1, i => { const u = i / (c - 1); return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u - 4 * sag * u * (1 - u), from[2] + (to[2] - from[2]) * u]; }, { colour, weight: .8, pins: [0, c - 1] }));
    rope.thin = .1;   // (a cord's weight: about 80 grams a metre)
    const list = typeof items === 'number' ? Array.from({ length: items }, (_, k) => ({ at: (k + .7) / (items + .4) })) : items, TONES = ['#f2f0ea', '#9cc0e0', '#e8b4a0', '#f0e2a0', '#b8d8b0'];
    const out = [rope];
    list.forEach((it, k) => {
      const [w, h] = it.size || [.55 + .2 * ((k * 7) % 3) / 2, .7 + .15 * ((k * 5) % 3) / 2], u0 = Math.max(.02, it.at - w / len / 2), u1 = Math.min(.98, it.at + w / len / 2);
      const cc = this.n(w), rr = this.n(h), top = u => { const y = from[1] + (to[1] - from[1]) * u - 4 * sag * u * (1 - u); return [from[0] + (to[0] - from[0]) * u, y, from[2] + (to[2] - from[2]) * u]; };
      const joins = [0, cc >> 1, cc - 1].map(i => [i, rope, Math.round((u0 + (u1 - u0) * i / (cc - 1)) * (c - 1))]);
      out.push(this.add(new Piece(this, 'sheet', cc, rr, (i, j) => { const p = top(u0 + (u1 - u0) * i / (cc - 1)); p[1] -= h * j / (rr - 1); return p; }, { colour: it.colour || TONES[k % TONES.length], weight: .2, joins, ...o })));
    });
    return out;
  }
  /**
   * A cloth of your own: cols x rows points at place(i, j) => [x, y, z]; pins: the points (j * cols + i) held where they start.
   * Every piece also takes open: how much of the wind reaches it (1; .3 in the lee of a wall; 0 indoors) and stiff (1; 2 for a stiffer cloth).
   */
  sheet({ cols = 8, rows = 8, place, pins = [], ...o } = {}) { return this.add(new Piece(this, 'sheet', cols, rows, place, { ...o, pins })); }
  /** A solid ball the cloth goes round: { x, y, z, r }; move it with set(x, y, z). */
  ball({ x = 0, y = 0, z = 0, r = .3 } = {}) { const s = { a: [x, y, z], b: [x, y, z], pa: null, pb: null, r, set(x, y, z) { this.a[0] = this.b[0] = x; this.a[1] = this.b[1] = y; this.a[2] = this.b[2] = z; return this; }, remove: () => { this.solids = this.solids.filter(q => q !== s); } }; this.solids.push(s); return s; }
  /** A solid rod with round ends from a to b, radius r (rb at b, if it narrows: a leg, a post); set(a, b) moves it. */
  capsule({ a = [0, 0, 0], b = [0, 1, 0], r = .1, rb = r } = {}) { const s = { a: a.slice(), b: b.slice(), pa: null, pb: null, r, rb, set(a, b) { this.a[0] = a[0]; this.a[1] = a[1]; this.a[2] = a[2]; this.b[0] = b[0]; this.b[1] = b[1]; this.b[2] = b[2]; return this; }, remove: () => { this.solids = this.solids.filter(q => q !== s); } }; this.solids.push(s); return s; }
  /**
   * A person's body as solid things the cloth goes round, following their bones every frame: the thighs, the shins, the trunk and the arms
   * as rods with round ends. on: a gs.models.human (or anything with bones of those names: hips, spine, legL, shinL, footL, armL, foreL, handL...).
   * skirt() and cape() add it for whoever wears them. Gives { solids, remove() }.
   */
  body(on, { arms = true } = {}) {
    const old = this.bodies.find(b => b.on === on); if (old) return old;
    const B = on?.bones || on?.rig?.parts || {}, made = [];
    for (const [a, oa, b, ob, r, rb] of BODY) {
      if ((!arms && /arm|fore/.test(a)) || !B[a] || !B[b]) continue;
      const s = this.capsule({ r, rb }); s.ends = [B[a], new Vector3(...oa), B[b], new Vector3(...ob)]; s.r0 = r; s.rb0 = rb; s.arm = /arm|fore/.test(a) ? (/fore/.test(a) ? 1 : 2) : 0; made.push(s);
    }
    const body = { on, solids: made, remove: () => { for (const s of made) s.remove(); this.bodies = this.bodies.filter(q => q !== body); } };
    this.bodies.push(body); this.bodyNow(body); for (const s of made) { s.pa = s.a.slice(); s.pb = s.b.slice(); }
    return body;
  }
  // a body's rods where its bones are now
  bodyNow(body) {
    body.on.updateMatrixWorld?.(true); const sc = body.on.getWorldScale?.(_v).x ?? 1;
    for (const s of body.solids) {
      const [ba, oa, bb, ob] = s.ends, a = _v.copy(oa).applyMatrix4(ba.matrixWorld); s.a[0] = a.x; s.a[1] = a.y; s.a[2] = a.z; const b = _v.copy(ob).applyMatrix4(bb.matrixWorld); s.b[0] = b.x; s.b[1] = b.y; s.b[2] = b.z; s.r = s.r0 * sc + PAD; s.rb = s.rb0 * sc + PAD;
      if (s.pa && Math.hypot(s.a[0] - s.pa[0], s.a[1] - s.pa[1], s.a[2] - s.pa[2]) > .5) { s.pa = s.a.slice(); s.pb = s.b.slice(); body.was = null; }   // (put somewhere else at once: no sweep from where it was)
    }
  }
  // a worn piece cut to fit: each column (i) widened (s, from 1) wherever it would be inside the body's rods as they are now, and never narrower
  // than the row above it (cloth hangs down off the widest part, the hips, it doesn't cinch back in under them). at(i, j, s) places a point
  // in the wearer's own space. Gives the points in the world.
  fit(body, m, c, r, at, arms = 0) {
    const out = [], rods = body.solids, M = .015, SC = new Float64Array(c);
    for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
      let s = 1, p; if (j) { const was = at(i, j - 1, SC[i]), wr = Math.hypot(was.x, was.z), now = at(i, j, 1); s = Math.max(1, wr / Math.max(1e-6, Math.hypot(now.x, now.z))); }
      for (let n = 0; n < 40; n++) {
        p = at(i, j, s).applyMatrix4(m); let clear = true;
        for (const q of rods) { if (q.arm && q.arm <= arms) continue; const d = segDist(p.x, p.y, p.z, q.a, q.b), t = segT(p.x, p.y, p.z, q.a, q.b); if (d < q.r + (q.rb - q.r) * t + M) { clear = false; break; } }
        if (clear) break; s += .02;
      }
      SC[i] = s; out[j * c + i] = p.toArray();
    }
    return out;
  }
  /**
   * A skirt (a kilt, a long coat's skirts) worn by a person: on, a gs.models.human; it rides their hips and goes round their legs (cloth.body).
   * length: metres down from the waist; flare: how much wider round the hem than at the waist (metres); waist: its half widths across and front
   * to back; at: the waist's height on them (a person's hips are at 1).
   */
  skirt({ on, length = .5, flare = .15, waist = [.2, .16], at = 1.02, ...o } = {}) {
    const hips = this.boneOf(on, 'hips'), [wx, wz] = waist, per = Math.PI * Math.sqrt((wx * wx + wz * wz + (wx + flare) ** 2 + (wz + flare) ** 2) / 1), c = Math.max(24, this.n(per, 64) - 1), r = this.nw(length);
    const pins = []; for (let i = 0; i < c; i++) pins.push(i);
    const body = this.body(on), m = on.matrixWorld, fit = this.fit(body, m, c, r, (i, j, s) => {
      const th = 2 * Math.PI * i / c, u = j / (r - 1);
      return _v.set(Math.sin(th) * (wx + flare * u) * s, at - length * u, Math.cos(th) * (wz + flare * u) * s);
    }, 2);
    const piece = this.add(new Piece(this, 'skirt', c, r, (i, j) => fit[j * c + i], { colour: '#4a5a78', weight: .25, carry: .75, arms: false, ...o, pins, loop: true }));
    return piece.ride(hips);
  }
  /**
   * A cape worn by a person: on, a gs.models.human; pinned across the back of the shoulders (it rides their upper back), it hangs length
   * metres and goes round their body and arms (cloth.body). width: across the shoulders; at: the height it hangs from (a person's shoulders: 1.46).
   */
  cape({ on, length = .95, width = .46, at = 1.46, ...o } = {}) {
    const spine = this.boneOf(on, 'spine'), c = this.nw(width + .1, 40), r = this.nw(length);
    const pins = []; for (let i = 0; i < c; i++) pins.push(i);
    on.updateMatrixWorld?.(true); const m = on.matrixWorld;
    const piece = this.add(new Piece(this, 'cape', c, r, (i, j) => {
      const u = 2 * i / (c - 1) - 1, d = length * j / (r - 1), wide = 1 + .25 * j / (r - 1);   // (wider at the foot)
      return _v.set(u * width / 2 * wide, at - d, -.13 + .09 * u * u - (j ? .05 : 0)).applyMatrix4(m).toArray();
    }, { colour: '#7a2030', weight: .3, carry: .5, ...o, pins }));
    this.body(on); return piece.ride(spine);
  }
  boneOf(on, name) { const b = on?.bones?.[name] || on?.rig?.parts?.[name]; if (!b) throw new Error(`gs.outdoors.Cloth: ${on?.name || 'that'} has no ${name} bone (a gs.models.human has)`); return b; }
  /** Takes every piece and solid away. */
  clear() { this.pieces = []; this.solids = []; this.bodies = []; this.felt.clear(); this.dirty = true; return this; }

  // ---- the points and links of every piece, in one set (made again when pieces come or go)
  build() {
    this.dirty = false; this.version = (this.version || 0) + 1; let N = 0;
    // (pieces there before keep where their points are and how they're going; new ones start as made)
    const was = this.N ? { P: this.P, V: this.V, A: this.A, at: new Map(this.pieces.filter(p => p.built).map(p => [p, p.base])) } : null;
    for (const p of this.pieces) { p.base = N; N += p.cols * p.rows; }
    this.N = N; const P = this.P = new Float32Array(N * 3), Q = this.Q = new Float32Array(N * 3), A = this.A = new Float32Array(N * 3), W = this.W = new Float32Array(N), V = this.V = new Float32Array(N * 3);
    const A0 = this.A0 = new Float32Array(N * 3), F = this.F = new Float32Array(N * 3), AR = this.AR = new Float32Array(N), PI = this.PI = new Uint8Array(N), NB = this.NB = new Int32Array(N * 4).fill(-1);
    const TT = this.TT = new Int32Array(N).fill(-1), TR = this.TR = new Float32Array(N);
    const links = [], col = new Float32Array(N * 3), idx = [];
    this.pieces.forEach((p, pi) => {
      const { cols: c, rows: r, base: b } = p, lp = p.loop;
      const ci = (i, d) => lp ? (i + d + c) % c : i + d, has = (i, d) => lp ? d < c : i + d >= 0 && i + d < c;   // (column i + d: round the seam on a loop)
      for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) { const k = b + j * c + i, x = p.place(i, j); P.set(x, k * 3); Q.set(x, k * 3); A.set(x, k * 3); PI[k] = pi; }
      // (each point's share of the sheet, its weight from that, and its neighbours: left, right, up, down, for its facing)
      for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
        const k = b + j * c + i, d = (a, z) => Math.hypot(P[a * 3] - P[z * 3], P[a * 3 + 1] - P[z * 3 + 1], P[a * 3 + 2] - P[z * 3 + 2]);
        const iL = lp ? ci(i, -1) : Math.max(0, i - 1), iR = lp ? ci(i, 1) : Math.min(c - 1, i + 1), du = c > 1 ? d(b + j * c + iL, b + j * c + iR) / (lp || (i > 0 && i < c - 1) ? 2 : 1) : 0, dv = r > 1 ? d(b + Math.max(0, j - 1) * c + i, b + Math.min(r - 1, j + 1) * c + i) / (j > 0 && j < r - 1 ? 2 : 1) : 0;
        const area = r > 1 ? du * dv : du * (p.thin || .01); AR[k] = area; W[k] = 1 / Math.max(1e-5, area * p.weight);
        NB[k * 4] = lp || i > 0 ? b + j * c + iL : k; NB[k * 4 + 1] = lp || i < c - 1 ? b + j * c + iR : k; NB[k * 4 + 2] = j > 0 ? k - c : k; NB[k * 4 + 3] = j < r - 1 ? k + c : k;
        const cs = p.colours, s = cs.length > 1 ? cs[Math.min(cs.length - 1, Math.floor((p.across ? j / r : i / c) * cs.length))] : cs[0];
        col[k * 3] = s.r; col[k * 3 + 1] = s.g; col[k * 3 + 2] = s.b;
      }
      for (const q of p.pinList) W[b + q] = 0;
      const L = (a, z, kind) => links.push(a, z, Math.hypot(P[a * 3] - P[z * 3], P[a * 3 + 1] - P[z * 3 + 1], P[a * 3 + 2] - P[z * 3 + 2]), LINK[kind] / p.stiff);
      for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
        const k = b + j * c + i, k1 = b + j * c + ci(i, 1), k2 = b + j * c + ci(i, 2);
        if (has(i, 1)) L(k, k1, 'along'); if (j < r - 1) L(k, k + c, 'along');
        if (has(i, 1) && j < r - 1) { L(k, k1 + c, 'shear'); L(k1, k + c, 'shear'); }
        if (has(i, 2) && c > 2) L(k, k2, 'bend'); if (j < r - 2) L(k, k + 2 * c, 'bend');
        if (r > 1 && has(i, 1) && j < r - 1) idx.push(k, k + c, k1, k1, k + c, k1 + c);
      }
      for (const [i, q, at] of p.joinList) if (q.base != null && this.pieces.includes(q)) links.push(b + i, q.base + at, 0, 0);   // (pegged: held on the line)
      // each point's nearest hold (a pin, or a peg on a line) and how far from it it was made: it never goes further than that, so a cloth
      // that hangs doesn't stretch, however few the steps (long-range attachments: Kim, Chentanez and Müller 2012). Along a cord, how far round it.
      const holds = p.pinList.map(q => [b + q, b + q]);
      for (const [i, q, at] of p.joinList) if (q.base != null && this.pieces.includes(q)) holds.push([b + i, q.base + at]);
      if (holds.length) {
        const arc = new Float32Array(c * r); if (r === 1) for (let i = 1; i < c; i++) { const a3 = (b + i) * 3, z3 = a3 - 3; arc[i] = arc[i - 1] + Math.hypot(P[a3] - P[z3], P[a3 + 1] - P[z3 + 1], P[a3 + 2] - P[z3 + 2]); }
        for (let k = b; k < b + c * r; k++) {
          if (W[k] === 0) continue; let best = Infinity, to = -1;
          for (const [o, hd] of holds) { const d = r === 1 ? Math.abs(arc[k - b] - arc[o - b]) : Math.hypot(P[k * 3] - P[o * 3], P[k * 3 + 1] - P[o * 3 + 1], P[k * 3 + 2] - P[o * 3 + 2]); if (d < best) { best = d; to = hd; } }
          TT[k] = to; TR[k] = best * 1.01;
        }
      }
    });
    this.L = new Float32Array(links); this.lam = new Float32Array(links.length / 4);
    this.pins = []; this.pieces.forEach(p => { for (const q of p.pinList) this.pins.push(p.base + q); });
    if (was) for (const [p, o] of was.at) { const n = p.cols * p.rows * 3; for (const [to, from] of [[P, was.P], [V, was.V], [A, was.A]]) to.set(from.subarray(o * 3, o * 3 + n), p.base * 3); Q.set(P.subarray(p.base * 3, p.base * 3 + n), p.base * 3); }
    A0.set(A);
    for (const p of this.pieces) p.built = true;
    // the mesh: one vertex a point, the sheets' triangles, and each rope drawn as a thin strip under its points
    const ropes = this.pieces.filter(p => p.rows === 1), extra = ropes.reduce((n, p) => n + p.cols, 0), g = new BufferGeometry();
    const pos = new Float32Array((N + extra) * 3), nor = new Float32Array((N + extra) * 3), cl = new Float32Array((N + extra) * 3); cl.set(col);
    let e = N; this.ropeAt = [];
    for (const p of ropes) { for (let i = 0; i < p.cols; i++) { this.ropeAt.push(p.base + i, e + i); cl.set(col.subarray((p.base + i) * 3, (p.base + i) * 3 + 3), (e + i) * 3); if (i < p.cols - 1) idx.push(p.base + i, e + i, p.base + i + 1, p.base + i + 1, e + i, e + i + 1); } e += p.cols; }
    g.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage)); g.setAttribute('normal', new BufferAttribute(nor, 3).setUsage(DynamicDrawUsage)); g.setAttribute('color', new BufferAttribute(cl, 3));
    g.setIndex(idx); g.boundingSphere = null;
    this.mesh.geometry.dispose(); this.mesh.geometry = g;
    this.sync();
  }

  /** Each frame. */
  update(dt) {
    if (this.dirty) this.build();
    if (!(dt > 0) || !this.N) return this;
    dt = Math.min(dt, 1 / 20); this.t += dt;
    for (const b of this.bodies) this.bodyNow(b);
    if (this.world) this.fromWorld();
    this.pinsNow(dt);
    this.winds();
    if (this.mode === 'gpu') { this.pending += dt; return this; }
    this.step(dt);
    this.sync();
    return this;
  }
  // where pins that ride something are now
  pinsNow(dt) {
    const A = this.A;
    for (const p of this.pieces) if (p.rider && p.local) {
      p.rider.updateWorldMatrix(true, false); const m = p.rider.matrixWorld, e = m.elements;
      p.pinList.forEach((q, n) => { const v = _v.copy(p.local[n]).applyMatrix4(m), k = (p.base + q) * 3; A[k] = v.x; A[k + 1] = v.y; A[k + 2] = v.z; }); this.pinsMoved = true;
      // (put somewhere else at once, half a metre or a fifth of a turn in a frame (a round starting, a cut): the cloth goes with it whole, rather than
      // being dragged through the body to its new place)
      let jumped = false;
      if (p.pm) { const f = p.pm.elements, moved = Math.hypot(e[12] - f[12], e[13] - f[13], e[14] - f[14]), cos = (e[0] * f[0] + e[1] * f[1] + e[2] * f[2] + e[8] * f[8] + e[9] * f[9] + e[10] * f[10]) / (Math.hypot(e[0], e[1], e[2]) * Math.hypot(f[0], f[1], f[2]) * 2); if (moved > .5 || cos < .8) { this.carry(p, _m.copy(p.pm).invert().premultiply(m)); jumped = true; } }
      (p.pm ||= new Matrix4()).copy(m);
      // (how fast it is going, smoothed over a tenth of a second: the air a body carries along doesn't jolt with each step)
      if (p.rp && !jumped) { const k = 1 - Math.exp(-dt * 10); for (let i = 0; i < 3; i++) p.rv[i] += (Math.max(-30, Math.min(30, (e[12 + i] - p.rp[i]) / dt)) - p.rv[i]) * k; } else p.rp ||= [0, 0, 0];
      p.rp[0] = e[12]; p.rp[1] = e[13]; p.rp[2] = e[14];
    }
  }
  // a piece taken along whole by D (a matrix): its points, where they were a step ago, its pins' last places and its going. On the graphics chip
  // the twin does the same to its own points at its next step.
  carry(p, D) {
    const { P, Q, V, A0 } = this, b = p.base * 3, n = p.cols * p.rows * 3, d = D.elements;
    for (const X of [P, Q, A0]) for (let k = b; k < b + n; k += 3) { _v.fromArray(X, k).applyMatrix4(D).toArray(X, k); }
    for (let k = b; k < b + n; k += 3) { const x = V[k], y = V[k + 1], z = V[k + 2]; V[k] = d[0] * x + d[4] * y + d[8] * z; V[k + 1] = d[1] * x + d[5] * y + d[9] * z; V[k + 2] = d[2] * x + d[6] * y + d[10] * z; }
    if (this.mode === 'gpu') (this.carries ||= []).push([this.pieces.indexOf(p), D.clone()]);
  }
  // the wind at each piece now (a gust there)
  winds() {
    const w = this.wind; let wx = 3, wy = 0, wz = 0;
    if (w && typeof w.at !== 'function') { wx = w.x || 0; wy = w.y || 0; wz = w.z || 0; }
    for (const p of this.pieces) {
      if (w && typeof w.at === 'function') { const k = (p.base + (p.cols >> 1) + (p.rows >> 1) * p.cols) * 3, g = w.at(this.A[k] ?? 0, this.A[k + 2] ?? 0); p.wind[0] = g.x * p.open; p.wind[1] = 0; p.wind[2] = g.z * p.open; }
      else { p.wind[0] = wx * p.open; p.wind[1] = wy * p.open; p.wind[2] = wz * p.open; }
      if (p.carry) for (let i = 0; i < 3; i++) p.wind[i] += p.carry * p.rv[i];   // (worn: the air round the body goes along with it)
      p.wind[3] = Math.sqrt(p.wind[0] * p.wind[0] + p.wind[2] * p.wind[2]);
    }
  }
  // the steps (here, when the graphics chip isn't doing them)
  step(dt) {
    const { N, P, Q, A, W, V, F, AR, PI, NB, L, lam, TT, TR } = this, S = this.stepsNow(), h = dt / S, t = this.t, pieces = this.pieces, nl = L.length / 4;
    // the wind's push on each point: on its share of the sheet, by how square the wind (less the cloth's own going) meets it
    for (let k = 0; k < N; k++) {
      const k3 = k * 3, pc = pieces[PI[k]], wd = pc.wind, sp = wd[3], ax = wd[0] / (sp || 1), az = wd[2] / (sp || 1), u = P[k3] * ax + P[k3 + 2] * az;
      const ph = FL.k * u - t * (FL.c0 + FL.c1 * sp) + FL.ky * P[k3 + 1], g = 1 + FL.gust * Math.sin(ph * .7 + 1.7) * Math.sin(t * 1.3 + u * .4), sd = FL.side * Math.sin(ph) * sp;
      const rx = wd[0] * g - az * sd - V[k3], ry = wd[1] * g - V[k3 + 1], rz = wd[2] * g + ax * sd - V[k3 + 2], rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
      const a = NB[k * 4] * 3, b = NB[k * 4 + 1] * 3, c = NB[k * 4 + 2] * 3, d = NB[k * 4 + 3] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nn = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nn > 1e-9 && W[k] > 0) {
        nx /= nn; ny /= nn; nz /= nn; const vn = rx * nx + ry * ny + rz * nz, aw = AR[k] * W[k] * rl * AIR, s = vn * aw, st = SKIN * aw;
        F[k3] = s * nx + st * (rx - vn * nx); F[k3 + 1] = s * ny + st * (ry - vn * ny); F[k3 + 2] = s * nz + st * (rz - vn * nz);
      } else if (W[k] > 0) { const s = .06 * rl * AR[k] * W[k]; F[k3] = rx * s; F[k3 + 1] = ry * s; F[k3 + 2] = rz * s; }   // (a cord: a drag along the wind)
      else F[k3] = F[k3 + 1] = F[k3 + 2] = 0;
      // (no faster than 25 metres a second a second from the wind: a light corner in a gale)
      const fa = Math.sqrt(F[k3] * F[k3] + F[k3 + 1] * F[k3 + 1] + F[k3 + 2] * F[k3 + 2]); if (fa > 25) { F[k3] *= 25 / fa; F[k3 + 1] *= 25 / fa; F[k3 + 2] *= 25 / fa; }
    }
    const solids = this.solids, ns = solids.length, gr = this.ground, damp = Math.exp(-h * .6), A0 = this.A0;
    const SO = this.SO = this.SO?.length >= ns * 14 ? this.SO : new Float32Array(Math.max(8, ns) * 14), near = this.nearSolids();   // (each solid now, and a step ago: its surface's going drags what it grips)
    for (let s = 0; s < S; s++) {
      // (pins and solid things go part of the way each small step, from where they were when it last stepped: a leg that swings 10 cm a frame
      // sweeps the cloth aside rather than jumping into it)
      const f = (s + 1) / S;
      const f0 = s / S;
      for (let q = 0; q < ns; q++) {
        const o = solids[q], pa = o.pa || o.a, pb = o.pb || o.b, q7 = q * 14;
        for (let e = 0; e < 3; e++) { SO[q7 + e] = pa[e] + (o.a[e] - pa[e]) * f; SO[q7 + 3 + e] = pb[e] + (o.b[e] - pb[e]) * f; SO[q7 + 7 + e] = pa[e] + (o.a[e] - pa[e]) * f0; SO[q7 + 10 + e] = pb[e] + (o.b[e] - pb[e]) * f0; }
        SO[q7 + 6] = o.r; SO[q7 + 13] = o.rb ?? o.r;
      }
      for (let k = 0; k < N; k++) {
        const k3 = k * 3; Q[k3] = P[k3]; Q[k3 + 1] = P[k3 + 1]; Q[k3 + 2] = P[k3 + 2];
        if (W[k] === 0) { P[k3] = A0[k3] + (A[k3] - A0[k3]) * f; P[k3 + 1] = A0[k3 + 1] + (A[k3 + 1] - A0[k3 + 1]) * f; P[k3 + 2] = A0[k3 + 2] + (A[k3 + 2] - A0[k3 + 2]) * f; continue; }
        V[k3] = V[k3] * damp + F[k3] * h; V[k3 + 1] = V[k3 + 1] * damp + (GRAV + F[k3 + 1]) * h; V[k3 + 2] = V[k3 + 2] * damp + F[k3 + 2] * h;
        P[k3] += V[k3] * h; P[k3 + 1] += V[k3 + 1] * h; P[k3 + 2] += V[k3 + 2] * h;
      }
      lam.fill(0);
      for (let c = 0; c < nl; c++) {
        const c4 = c * 4, a = L[c4], b = L[c4 + 1], rest = L[c4 + 2], al = L[c4 + 3] / (h * h), wa = W[a], wb = W[b], ws = wa + wb; if (ws <= 0) continue;
        const a3 = a * 3, b3 = b * 3, dx = P[a3] - P[b3], dy = P[a3 + 1] - P[b3 + 1], dz = P[a3 + 2] - P[b3 + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz); if (l < 1e-9) continue;
        if (rest === 0 && al === 0) { const ka = wa / ws, kb = wb / ws; P[a3] -= dx * ka; P[a3 + 1] -= dy * ka; P[a3 + 2] -= dz * ka; P[b3] += dx * kb; P[b3 + 1] += dy * kb; P[b3 + 2] += dz * kb; continue; }
        const C = l - rest, dl = (-C - al * lam[c]) / (ws + al); lam[c] += dl; const sx = dx / l * dl, sy = dy / l * dl, sz = dz / l * dl;
        P[a3] += sx * wa; P[a3 + 1] += sy * wa; P[a3 + 2] += sz * wa; P[b3] -= sx * wb; P[b3 + 1] -= sy * wb; P[b3 + 2] -= sz * wb;
      }
      for (let k = 0; k < N; k++) {
        if (W[k] === 0) continue; const k3 = k * 3, to = TT[k];
        if (to >= 0) { const t3 = to * 3, dx = P[k3] - P[t3], dy = P[k3 + 1] - P[t3 + 1], dz = P[k3 + 2] - P[t3 + 2], l = Math.sqrt(dx * dx + dy * dy + dz * dz), r = TR[k]; if (l > r) { const s = r / l; P[k3] = P[t3] + dx * s; P[k3 + 1] = P[t3 + 1] + dy * s; P[k3 + 2] = P[t3 + 2] + dz * s; } }
        const nr = near[PI[k]];
        for (let q = 0; q < nr.length; q++) push(P, Q, k3, SO, nr[q] * 14);
        if (gr != null) { const g = typeof gr === 'function' ? gr(P[k3], P[k3 + 2]) : gr; if (P[k3 + 1] < g + .01) { P[k3 + 1] = g + .01; P[k3] -= (P[k3] - Q[k3]) * GRIP; P[k3 + 2] -= (P[k3 + 2] - Q[k3 + 2]) * GRIP; } }
        V[k3] = (P[k3] - Q[k3]) / h; V[k3 + 1] = (P[k3 + 1] - Q[k3 + 1]) / h; V[k3 + 2] = (P[k3 + 2] - Q[k3 + 2]) / h;
      }
    }
    this.stepped();
  }
  // where pins and solid things were when it last stepped (the next steps start from there)
  stepped() {
    this.A0.set(this.A);
    for (const b of this.bodies) { const e = b.on.matrixWorld.elements; b.was = [e[12], e[13], e[14]]; }
    for (const o of this.solids) { (o.pa ||= [0, 0, 0]); (o.pb ||= [0, 0, 0]); for (let e = 0; e < 3; e++) { o.pa[e] = o.a[e]; o.pb[e] = o.b[e]; } }
  }
  // how many small steps this frame: more while limbs swing fast through clothes (a run: a shin goes 10 cm a frame past the body), so that
  // each small step moves a solid about a centimetre past the cloth; at least steps, at most three times as many
  stepsNow() {
    let most = 0;
    for (const b of this.bodies) {
      const e = b.on.matrixWorld.elements, w = b.was; if (!w) continue; const ox = e[12] - w[0], oy = e[13] - w[1], oz = e[14] - w[2];   // (less the whole body's going: its clothes go with that)
      for (const s of b.solids) if (s.pa) most = Math.max(most, Math.hypot(s.a[0] - s.pa[0] - ox, s.a[1] - s.pa[1] - oy, s.a[2] - s.pa[2] - oz), Math.hypot(s.b[0] - s.pb[0] - ox, s.b[1] - s.pb[1] - oy, s.b[2] - s.pb[2] - oz));
    }
    for (const s of this.solids) if (!s.ends && s.pa) most = Math.max(most, Math.hypot(s.a[0] - s.pa[0], s.a[1] - s.pa[1], s.a[2] - s.pa[2]), Math.hypot(s.b[0] - s.pb[0], s.b[1] - s.pb[1], s.b[2] - s.pb[2]));
    return this.lastSteps = Math.min(this.steps * 3, Math.max(this.steps, Math.ceil(most / MOVE)));
  }
  // the bodies of the physics world near the cloth, as solids it goes round (the nearest, as many as there is room for)
  fromWorld() {
    const W = this.world, P = this.P, N = this.N; if (!W.world || !N) { for (const s of this.felt.values()) s.remove(); this.felt.clear(); return; }
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < N; k++) { const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, reach = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 1.5;
    const room = SOLIDS_MAX - (this.solids.length - this.felt.size) - this.bodies.reduce((a, b) => a + b.solids.length, 0);
    const R = W.R, near = [];
    for (const t of W.near(c, reach)) {
      const b = t.body, col = t.collider; if (!b || !col || b.isFixed() || col.isSensor()) continue;
      const p = W.outer(b.translation()); near.push([Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z), t, p]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const keep = new Set();
    for (const [, t, p] of near.slice(0, Math.max(0, room))) {
      const col = t.collider, type = col.shapeType(), q = t.body.rotation(), ST = R.ShapeType;
      // the body's shape as a ball or a rod: a capsule along its axis, a box or a hull as a rod along its longest side
      let r = .3, h = 0, ax = [0, 1, 0];
      if (type === ST.Ball) r = col.radius();
      else if (type === ST.Capsule) { r = col.radius(); h = col.halfHeight(); }
      else if (type === ST.Cuboid || type === ST.RoundCuboid) {
        const e = col.halfExtents(), k = e.x >= e.y && e.x >= e.z ? 'x' : e.y >= e.z ? 'y' : 'z', o = ['x', 'y', 'z'].filter(a => a !== k), rr = (type === ST.RoundCuboid ? col.roundRadius() : 0);
        r = Math.min(e[o[0]], e[o[1]]) + rr; h = Math.max(0, e[k] + rr - r); ax = k === 'x' ? [1, 0, 0] : k === 'y' ? [0, 1, 0] : [0, 0, 1];
      } else { const m = t.mesh?.geometry; if (m) { if (!m.boundingSphere) m.computeBoundingSphere(); r = m.boundingSphere.radius * .8; } }
      const u = turn(q, ax), a = [p.x - u[0] * h, p.y - u[1] * h, p.z - u[2] * h], e2 = [p.x + u[0] * h, p.y + u[1] * h, p.z + u[2] * h];
      let s = this.felt.get(t); if (!s) { s = this.capsule({ a, b: e2, r }); this.felt.set(t, s); } else { s.r = s.rb = r; s.set(a, e2); }
      keep.add(t);
    }
    for (const [t, s] of this.felt) if (!keep.has(t)) { s.remove(); this.felt.delete(t); }
  }
  // for each piece, the solid things that might reach it this frame (a ball round its points against each solid's reach, half a metre spare)
  nearSolids() {
    const out = this.near ||= [], P = this.P, solids = this.solids; out.length = this.pieces.length;
    this.pieces.forEach((p, n) => {
      const l = out[n] ||= []; l.length = 0; if (!solids.length) return;
      const b = p.base, m = p.cols * p.rows; let cx = 0, cy = 0, cz = 0, r = 0;
      for (let k = b; k < b + m; k++) { cx += P[k * 3]; cy += P[k * 3 + 1]; cz += P[k * 3 + 2]; } cx /= m; cy /= m; cz /= m;
      for (let k = b; k < b + m; k++) r = Math.max(r, (P[k * 3] - cx) ** 2 + (P[k * 3 + 1] - cy) ** 2 + (P[k * 3 + 2] - cz) ** 2); r = Math.sqrt(r);
      solids.forEach((o, q) => { if (!(o.arm && o.arm <= p.skips) && segDist(cx, cy, cz, o.a, o.b) < r + Math.max(o.r, o.rb ?? 0) + .5) l.push(q); });
    });
    return out;
  }
  // the mesh from the points: places, and each point's facing from its neighbours
  sync() {
    const g = this.mesh.geometry, pos = g.attributes.position?.array, nor = g.attributes.normal?.array; if (!pos || !this.N) return;
    const { N, P, NB } = this; pos.set(P);
    for (let k = 0; k < N; k++) {
      const a = NB[k * 4] * 3, b = NB[k * 4 + 1] * 3, c = NB[k * 4 + 2] * 3, d = NB[k * 4 + 3] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
      let nx = uz * vy - uy * vz, ny = ux * vz - uz * vx, nz = uy * vx - ux * vy; const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    }
    const ra = this.ropeAt; for (let n = 0; n < ra.length; n += 2) { const s = ra[n] * 3, e = ra[n + 1] * 3; pos[e] = P[s]; pos[e + 1] = P[s + 1] - .012; pos[e + 2] = P[s + 2]; nor[s] = nor[e] = 0; nor[s + 1] = nor[e + 1] = 1; nor[s + 2] = nor[e + 2] = 0; }
    g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true; g.boundingSphere = null;
  }

  /* ----- the graphics chip takes over (hd3d.js calls this every frame the view draws) ----- */
  gpuStep(G) {
    if (G && G.fx?.gpuCloth && this.N) {
      if (this.twin?.r !== G.r || this.twin.version !== this.version) { this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = { r: G.r, ...G.fx.gpuCloth(this) }; }
      this.mode = 'gpu';
      if (this.mesh.parent && this.twin.mesh.parent !== this.mesh.parent) this.mesh.parent.add(this.twin.mesh);
      this.mesh.visible = false; this.twin.mesh.visible = true;
      const dt = this.pending; this.pending = 0; if (dt > 0) { this.twin.step(G.r, dt, this.stepsNow()); this.stepped(); }
    } else if (this.mode === 'gpu') this.toCpu();
  }
  toCpu() { this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = null; this.mode = 'cpu'; this.mesh.visible = true; this.pending = 0; this.build(); }
  /** Frees what it holds (the card leaving the feed does this). */
  free() { this.dispose(); }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); this.twin?.mesh.removeFromParent(); this.twin?.dispose(); this.twin = null; const s = this.view?.sims, i = s ? s.indexOf(this) : -1; if (i >= 0) s.splice(i, 1); }
}
const _v = new Vector3(), _m = new Matrix4();
// a point pushed out of a solid ball or capsule (a ball is a capsule from a point to itself), and held by GRIP of its sliding over it (cloth on a
// ball stays on it, as a sheet thrown over a chair does). The sliding is against the solid's own surface: a leg that swings carries the skirt on it
// with it, and a body walking on doesn't leave its clothes behind. SO[o..]: the rod now (a, b, r), then a small step ago (a, b), and r at b.
function push(P, Q, k3, SO, o) {
  const ax = SO[o], ay = SO[o + 1], az = SO[o + 2], bx = SO[o + 3] - ax, by = SO[o + 4] - ay, bz = SO[o + 5] - az, px = P[k3] - ax, py = P[k3 + 1] - ay, pz = P[k3 + 2] - az;
  const bb = bx * bx + by * by + bz * bz, t = bb > 1e-12 ? Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / bb)) : 0;
  const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t, d = Math.sqrt(dx * dx + dy * dy + dz * dz), r = SO[o + 6] + (SO[o + 13] - SO[o + 6]) * t + .01;
  if (d < r && d > 1e-9) {
    const k = r / d - 1; P[k3] += dx * k; P[k3 + 1] += dy * k; P[k3 + 2] += dz * k;
    const t1 = 1 - t, sx = (SO[o] - SO[o + 7]) * t1 + (SO[o + 3] - SO[o + 10]) * t, sy = (SO[o + 1] - SO[o + 8]) * t1 + (SO[o + 4] - SO[o + 11]) * t, sz = (SO[o + 2] - SO[o + 9]) * t1 + (SO[o + 5] - SO[o + 12]) * t;
    const nx = dx / d, ny = dy / d, nz = dz / d, mx = P[k3] - Q[k3] - sx, my = P[k3 + 1] - Q[k3 + 1] - sy, mz = P[k3 + 2] - Q[k3 + 2] - sz, mn = mx * nx + my * ny + mz * nz;
    P[k3] -= (mx - mn * nx) * GRIP; P[k3 + 1] -= (my - mn * ny) * GRIP; P[k3 + 2] -= (mz - mn * nz) * GRIP;
  }
}
// how far along a rod from a to b a point is nearest (0..1)
function segT(x, y, z, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], bb = bx * bx + by * by + bz * bz;
  return bb > 1e-12 ? Math.max(0, Math.min(1, ((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / bb)) : 0;
}
// how far a point is from a rod from a to b
function segDist(x, y, z, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], px = x - a[0], py = y - a[1], pz = z - a[2], bb = bx * bx + by * by + bz * bz;
  const t = bb > 1e-12 ? Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / bb)) : 0;
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t);
}
export const CLOTH = { STEPS, LINK, AIR, SKIN, GRIP, FL, BODY };
// per-frame work, timed while the frame lab is open (prof.js)
timed(Cloth.prototype, 'update', 'cloth');
