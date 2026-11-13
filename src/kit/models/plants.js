// gs.models' plants that EZ-Tree can't grow, by growth rules of their own: palms (a feather palm with a
// leaning ringed trunk and a crown of arching fronds, a fan palm with a skirt of dead leaves), tropical
// plants (banana, fern and tree fern, elephant ears), swamp plants (a bald cypress with a flared foot,
// knees and hanging moss, reeds and cattails, lily pads) and flowers; ivy grown over meshes; weeds in
// cracks and at the foot of walls. Leaves are strips with pictures drawn in code (plant-textures.js) and
// the fronds look (looks.js): each leaf bounces, flutters and leans downwind from where it grows, and
// can be brushed aside by what walks through (a gs.outdoors.Marks grass field). No image or model files.
// Every leaf point carries lkFrond (where its leaf starts, in the plant's own metres, and how far along
// it the point is) and lkFrondId (which leaf, how long); group.userData.fronds lists each leaf once
// ({ id, root, dir, len }), for whatever moves leaves next.
// Kit use only: games reach these as gs.models.tree(kind), gs.models.ivy and gs.models.weeds.
import { BufferGeometry, Float32BufferAttribute, Box3, Group, Mesh, InstancedMesh, InstancedBufferAttribute, MeshStandardMaterial, DoubleSide, Ray, Vector3, Matrix4, Quaternion, Color, IcosahedronGeometry, CylinderGeometry, ConeGeometry } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { plantTexture, fernShape } from './plant-textures.js';
import { material } from './materials.js';
import { looks } from '../looks.js';
import { pbr } from '../hd3d.js';
import { pause, built, loading } from '../slices.js';

const TAU = Math.PI * 2, GOLD = 2.39996323, UP = new Vector3(0, 1, 0);
const rand = seed => { let s = (Math.imul(seed + 1, 2654435761) >>> 0) % 2147483647 || 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rgb = c => { const k = new Color(c); return [k.r, k.g, k.b]; };
// the vertex colour that turns a leaf of colour `base` into colour c (dead fronds, a skirt of dry leaves)
const tint = (c, base, k = 1) => { const a = rgb(c), b = rgb(base); return a.map((v, i) => v / Math.max(.01, b[i]) * k); };

/** The kinds tree() grows here (the rest are EZ-Tree's). */
export const PLANT_KINDS = ['palm', 'fan', 'banana', 'fern', 'taro', 'cypress', 'reeds', 'flowers', 'lily'];
// a kind's height (metres) when none is asked for, its leaf picture, leaf and trunk colours, how far its leaf tips move in the wind
const KIND = {
  palm: { height: 9, pic: 'frond', leaves: '#5d8a34', bark: '#8c7c64', sway: .07 },
  fan: { height: 10, pic: 'fan', leaves: '#5f8c3c', bark: '#7a6c58', sway: .05 },
  banana: { height: 4, pic: 'paddle', leaves: '#6aa03a', bark: '#6f7d3c', sway: .07 },
  fern: { height: 1.2, pic: 'fern', leaves: '#4e8a30', bark: '#3d3024', sway: .1 },
  taro: { height: 1.5, pic: 'heart', leaves: '#3f7a2c', bark: '#5f7a3a', sway: .08 },
  cypress: { height: 16, pic: 'spray', leaves: '#4f6e34', bark: '#6a5444', sway: .05 },
  reeds: { height: 2, pic: 'blade', leaves: '#7d9a48', bark: '#5c4632', sway: .12 },
  flowers: { height: .5, pic: 'blade', leaves: '#4f8a34', bark: '#4f8a34', sway: .14 },
  lily: { height: .05, pic: 'pad', leaves: '#4a7f34', bark: '#4a7f34', sway: .02 },
};

/** A kind's height in metres when none is asked for. */
export const plantHeight = kind => KIND[kind].height;

/* ---------- making points ---------- */
// one mesh's points as they are made: position, normal, uv, colour, and for leaves where each leaf starts (lkFrond, lkFrondId)
class Parts {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.F = []; this.FI = []; this.I = []; this.n = 0; }
  vert(p, n, u, v, c = [1, 1, 1], f = null, fi = null) {
    this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.U.push(u, v); this.C.push(c[0], c[1], c[2]);
    if (f) { this.F.push(f[0], f[1], f[2], f[3]); this.FI.push(fi[0], fi[1]); } else { this.F.push(0, 0, 0, 0); this.FI.push(0, 1); }
    return this.n++;
  }
  tri(a, b, c) { this.I.push(a, b, c); }
  // another shape's points, moved by m (for knobs, nuts and heads made from three's own shapes)
  add(geo, m, c = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, p = new Vector3(), n = new Vector3(), nm = new Matrix4().copy(m).invert().transpose();
    for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i).applyMatrix4(m); n.fromBufferAttribute(N, i).applyMatrix4(nm).normalize(); this.vert(p, n, U ? U.getX(i) : 0, U ? U.getY(i) : 0, c); }
    for (let i = 0; i < P.count; i += 3) this.tri(this.n - P.count + i, this.n - P.count + i + 1, this.n - P.count + i + 2);
  }
  get empty() { return this.n === 0; }
  geometry(leaves = true) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new Float32BufferAttribute(this.N, 3)); g.setAttribute('uv', new Float32BufferAttribute(this.U, 2)); g.setAttribute('color', new Float32BufferAttribute(this.C, 3));
    if (leaves) { g.setAttribute('lkFrond', new Float32BufferAttribute(this.F, 4)); g.setAttribute('lkFrondId', new Float32BufferAttribute(this.FI, 2)); }
    g.setIndex(this.I); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
}

// A leaf's middle line: from root, heading out at yaw (round from +x towards +z) and pitch (up from level) for
// len metres in n pieces, bending down by droop radians over its length (more towards the tip) and round by side.
function spine(root, yaw, pitch, len, n, droop = 0, side = 0) {
  const pts = [root.clone()]; let p = root.clone();
  for (let i = 1; i <= n; i++) {
    const t = (i - .5) / n, e = pitch - droop * Math.pow(t, 1.4), y = yaw + side * t;
    p = p.clone().add(new Vector3(Math.cos(e) * Math.cos(y), Math.sin(e), Math.cos(e) * Math.sin(y)).multiplyScalar(len / n)); pts.push(p);
  }
  return pts;
}

// A leaf along a spine: half its width at each point (half(t), t 0..1 along the strip), folded up along its middle
// by fold radians (a V), its picture's v from v0 to v1. lead: metres of the same leaf before the strip starts (a
// stalk drawn separately), so `along` counts from the leaf's own start; len: the whole leaf's length. Returns the strip's length.
const T_ = new Vector3(), S_ = new Vector3(), N_ = new Vector3(), A_ = new Vector3(), B_ = new Vector3();
function leaf(out, pts, half, { fold = 0, v0 = 0, v1 = 1, u0 = 0, u1 = 1, colour = [1, 1, 1], id = 0, root = pts[0], lead = 0, len = null, twist = 0, across = null } = {}) {
  const n = pts.length, s = [0]; for (let i = 1; i < n; i++) s.push(s[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = s[n - 1] || 1e-3, L = len ?? total + lead, base = out.n, cf = Math.cos(fold), sf = Math.sin(fold);
  for (let i = 0; i < n; i++) {
    const t = s[i] / total;
    T_.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    if (across) S_.copy(across).addScaledVector(T_, -across.dot(T_)); else S_.crossVectors(T_, UP);
    if (S_.lengthSq() < 1e-8) S_.set(1, 0, 0); S_.normalize();
    if (twist) S_.applyAxisAngle(T_, twist * t);
    N_.crossVectors(S_, T_).normalize(); if (N_.y < 0 && !across) { N_.negate(); S_.negate(); }   // (the face that looks up: both sides are lit alike)
    const h = half(t), a = clamp((lead + s[i]) / L, 0, 1), f = [root.x, root.y, root.z, a], fi = [id, L], v = v0 + (v1 - v0) * t;
    A_.copy(pts[i]).addScaledVector(S_, -h * cf).addScaledVector(N_, h * sf); B_.copy(pts[i]).addScaledVector(S_, h * cf).addScaledVector(N_, h * sf);
    out.vert(A_, N_, u0, v, colour, f, fi); out.vert(pts[i], N_, (u0 + u1) / 2, v, colour, f, fi); out.vert(B_, N_, u1, v, colour, f, fi);
  }
  for (let i = 0; i < n - 1; i++) { const a = base + i * 3, b = a + 3; out.tri(a, b, a + 1); out.tri(a + 1, b, b + 1); out.tri(a + 1, b + 1, a + 2); out.tri(a + 2, b + 1, b + 2); }
  return total;
}

// A trunk or stem along a spine: rings of seg points, radius r(t, angle) (t 0 at the foot .. 1 at the top); its
// picture's u goes round it, v up it in tiles of `tile` metres.
function trunk(out, pts, r, seg = 10, tile = 1, colour = [1, 1, 1]) {
  const n = pts.length, base = out.n, T = new Vector3(), X = new Vector3(1, 0, 0), Z = new Vector3(), p = new Vector3(), nn = new Vector3(); let s = 0;
  for (let i = 0; i < n; i++) {
    if (i) s += pts[i].distanceTo(pts[i - 1]);
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    X.addScaledVector(T, -X.dot(T)); if (X.lengthSq() < 1e-6) X.set(0, 0, 1).addScaledVector(T, -T.z); X.normalize(); Z.crossVectors(X, T);
    const t = i / (n - 1);
    for (let j = 0; j <= seg; j++) {
      const a = j / seg * TAU, c = Math.cos(a), sn = Math.sin(a), rr = r(t, a);
      nn.copy(X).multiplyScalar(c).addScaledVector(Z, sn); p.copy(pts[i]).addScaledVector(nn, rr);
      out.vert(p, nn, j / seg, s / tile, colour);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = base + i * (seg + 1) + j, b = a + seg + 1; out.tri(a, b, a + 1); out.tri(a + 1, b, b + 1); }
}

/* ---------- the kinds ---------- */
// Each grows into { trunk, leaves, fruit?, flowers?, moss? } (Parts) and the list of leaves.
const GROW = {
  // a feather palm: a ringed trunk swollen at the foot that leans out and curves back up, a crown of arching
  // fronds (young ones up, old ones drooping), two or three dead ones hanging brown, and nuts under the crown
  palm(o, R, P) {
    const H = o.height, az = R() * TAU, lean = (o.lean ?? .12 + R() * .2) * H, dx = Math.cos(az), dz = Math.sin(az), sp = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20, off = lean * (t * 1.6 - t * t * .6) / 1, y = H * t * (1 - .04 * lean / H); sp.push(new Vector3(dx * off + Math.sin(t * 9 + az) * .04, y, dz * off + Math.cos(t * 7 + az) * .04)); }
    const r0 = .19 * Math.sqrt(H / 9);
    trunk(P.trunk, sp, (t) => r0 * (1 - .32 * t) * (1 + .7 * Math.exp(-t * H / .55)) * (1 + .25 * Math.max(0, (t - .95) / .05)), 12, TAU * r0);
    const top = sp.at(-1), n = o.fronds ?? 18, dead = o.dead ?? 2 + Math.floor(R() * 2), list = [];
    for (let i = 0; i < n + dead; i++) {
      const old = i >= n, age = old ? 1.15 : i / (n - 1), yaw = az + i * GOLD + (R() - .5) * .2;
      const pitch = old ? -1.25 + R() * .3 : lerp(1.15, -.35, age) + (R() - .5) * .25, droop = old ? .25 : lerp(.35, 1.35, age) + R() * .2;
      const len = H * .45 * (old ? .8 : lerp(.72, 1.05, Math.min(1, age * 1.4))) * (.9 + R() * .2), root = top.clone().add(new Vector3(Math.cos(yaw) * r0 * .7, -age * .25, Math.sin(yaw) * r0 * .7));
      const pts = spine(root, yaw, pitch, len, 14, droop, (R() - .5) * .3), W = len * .17;
      leaf(P.leaves, pts, t => t < .12 ? .035 : W * Math.pow(Math.sin(Math.PI * (t - .12) / .88), .55) * (1 - .3 * (t - .12)), { fold: old ? .1 : .38, colour: old ? tint('#7d6038', o.leaves, .85 + R() * .3) : [1, 1, 1], id: i, twist: old ? .6 : 0 });
      list.push(frondOf(i, pts, len));
    }
    if (o.fruit !== false) {   // nuts in a bunch under the crown
      const g = new IcosahedronGeometry(.11 * r0 / .19, 1), m = new Matrix4(), k = 3 + Math.floor(R() * 6);
      for (let i = 0; i < k; i++) { const a = R() * TAU, d = r0 * (.9 + R() * .4); m.makeTranslation(top.x + Math.cos(a) * d, top.y - .25 - R() * .3, top.z + Math.sin(a) * d); P.fruit.add(g, m); }
    }
    return list;
  },
  // a fan palm: a tall straight trunk, a skirt of dead leaves hanging under the crown, and round pleated fans on long stalks
  fan(o, R, P) {
    const H = o.height, az = R() * TAU, sp = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; sp.push(new Vector3(Math.cos(az) * H * .03 * t * t + Math.sin(t * 6) * .03, H * t, Math.sin(az) * H * .03 * t * t)); }
    const r0 = .2 * Math.sqrt(H / 12);
    trunk(P.trunk, sp, t => r0 * (1 - .2 * t) * (1 + .45 * Math.exp(-t * H / .5)), 12, TAU * r0);
    const top = sp.at(-1), list = [];
    if (o.skirt !== false) {   // the old leaves, dried and hanging down round the trunk
      const k = 30, d = H * .16;
      for (let i = 0; i < k; i++) {
        const a = i / k * TAU + R() * .2, root = top.clone().add(new Vector3(Math.cos(a) * r0 * 1.1, -.3 - R() * .2, Math.sin(a) * r0 * 1.1));
        const pts = spine(root, a, -1.42 + R() * .12, d * (.8 + R() * .4), 4, -.2);
        leaf(P.leaves, pts, () => .16 + R() * .02, { u0: .5, u1: .5, v0: .5, v1: .5, colour: tint('#bba070', o.leaves, .85 + R() * .4), id: 100 + i, across: new Vector3(-Math.sin(a), 0, Math.cos(a)) });
        list.push(frondOf(100 + i, pts, pts[0].distanceTo(pts.at(-1))));
      }
    }
    const n = o.fronds ?? 22, z = Math.sqrt(H / 10);
    for (let i = 0; i < n; i++) {
      const age = i / (n - 1), yaw = az + i * GOLD, pitch = lerp(1.25, -.45, age) + (R() - .5) * .25, pl = (1.4 + R() * .6) * z, Rf = .95 * z * (.85 + R() * .3);
      const root = top.clone().add(new Vector3(Math.cos(yaw) * r0 * .6, -age * .2, Math.sin(yaw) * r0 * .6)), stalk = spine(root, yaw, pitch, pl, 4, .25 * age);
      leaf(P.leaves, stalk, () => .03, { u0: .5, u1: .5, v0: .5, v1: .5, id: i, len: pl + Rf });   // (its stalk: the picture's whole middle)
      fanLeaf(P.leaves, stalk.at(-1), stalk.at(-1).clone().sub(stalk.at(-2)).normalize(), Rf, R, { id: i, root, lead: pl, len: pl + Rf, droop: .15 + age * .25 });
      list.push(frondOf(i, [root, stalk.at(-1)], pl + Rf));
    }
    return list;
  },
  // a banana: a green stem of rolled leaf bases, long paddle leaves on short stalks that arch out and down, torn along their veins
  banana(o, R, P) {
    const H = o.height, stem = H * .55, az = R() * TAU, sp = [];
    for (let i = 0; i <= 6; i++) sp.push(new Vector3(Math.sin(i * .7 + az) * .02, stem * i / 6, Math.cos(i * .5) * .02));
    const r0 = .14 * Math.sqrt(H / 4);
    trunk(P.trunk, sp, t => r0 * (1 - .35 * t) * (1 + .3 * Math.exp(-t * 4)), 10, .9);
    const top = sp.at(-1), n = o.fronds ?? 9, list = [];
    for (let i = 0; i < n; i++) {
      const age = i / (n - 1), yaw = az + i * GOLD, pitch = lerp(1.35, .15, age) + (R() - .5) * .2, len = H * .62 * (.85 + R() * .25), pet = len * .14;
      const root = top.clone().add(new Vector3(0, -age * stem * .25, 0)), pts = spine(root, yaw, pitch, len, 14, lerp(.5, 1.7, age) + R() * .3, (R() - .5) * .3), W = len * .14;
      leaf(P.leaves, pts, t => t * len < pet ? .025 : W * Math.pow(Math.sin(Math.PI * clamp((t * len - pet) / (len - pet), .03, 1)), .45), { fold: .14, v0: -.02, id: i, twist: (R() - .5) * .8 });
      list.push(frondOf(i, pts, len));
    }
    return list;
  },
  // a fern: arching fronds from a crown at the ground, or on top of a fibrous trunk (trunk: metres) for a tree fern
  fern(o, R, P) {
    const T = o.trunk ?? 0, H = T > 0 ? Math.max(1.4, o.height - T) : o.height, az = R() * TAU;
    let top = new Vector3();
    if (T > 0) { const sp = []; for (let i = 0; i <= 10; i++) sp.push(new Vector3(Math.sin(i * .6 + az) * .05, T * i / 10, Math.cos(i * .4) * .05)); trunk(P.trunk, sp, t => .14 * (1 + .4 * (1 - t)) * (1 + .5 * Math.exp(-t * 6)), 8, .8); top = sp.at(-1); }
    const n = o.fronds ?? (T > 0 ? 16 : 13), list = [];
    for (let i = 0; i < n; i++) {
      const age = i / (n - 1), yaw = az + i * GOLD, len = H * (T > 0 ? 1.6 : 1.05) * (.8 + R() * .3), pitch = T > 0 ? lerp(.9, -.1, age) : lerp(1.25, .55, age) + (R() - .5) * .2;
      const pts = spine(top, yaw, pitch, len, 12, lerp(1, 1.9, age) + R() * .3, (R() - .5) * .4), W = len * .17;
      leaf(P.leaves, pts, t => t < .1 ? .015 : W * Math.min(1, fernShape((t - .1) / .9) * 1.08), { fold: .22, id: i });
      list.push(frondOf(i, pts, len));
    }
    return list;
  },
  // elephant ears: big heart-shaped leaves on tall stalks from the ground, hanging tip down
  taro(o, R, P) {
    const H = o.height, az = R() * TAU, n = o.fronds ?? 6, list = [];
    for (let i = 0; i < n; i++) {
      const yaw = az + i * GOLD, pl = H * (.55 + R() * .25), root = new Vector3(Math.cos(yaw) * .05, 0, Math.sin(yaw) * .05);
      const stalk = spine(root, yaw, 1.32 + (R() - .5) * .15, pl, 6, .5 + R() * .3), at = stalk.at(-1), B = H * .62 * (.8 + R() * .3);
      leaf(P.leaves, stalk, () => .022, { u0: .5, u1: .5, v0: .3, v1: .31, id: i, len: pl + B * .68 });
      // the blade: a line through where the stalk meets it, out and down, the notch's lobes behind it
      const d = new Vector3(Math.cos(yaw), -.55 - R() * .3, Math.sin(yaw)).normalize(), pts = [];
      for (let k = 0; k <= 8; k++) { const s = (k / 8 - .32) * B, droop = s > 0 ? s * s / B * .45 : 0; pts.push(at.clone().addScaledVector(d, s).add(new Vector3(0, -droop, 0))); }
      leaf(P.leaves, pts, () => B * .5, { fold: .18, id: i, lead: pl - .32 * B, len: pl + B * .68 });
      list.push(frondOf(i, [root, at, pts.at(-1)], pl + B * .68));
    }
    return list;
  },
  // a bald cypress of the swamp: a flared, ribbed foot, knees standing up round it, a crown of near-level
  // branches clothed in feathery sprays (longest low in the crown, a rounded top), and moss hanging in beards
  cypress(o, R, P) {
    const H = o.height, az = R() * TAU, sp = [], z = H / 16;
    for (let i = 0; i <= 24; i++) { const t = i / 24; sp.push(new Vector3(Math.sin(t * 5 + az) * .12 * t, H * t, Math.cos(t * 4 + az) * .12 * t)); }
    const r0 = .32 * Math.sqrt(H / 16);
    trunk(P.trunk, sp, (t, a) => { const foot = Math.exp(-t * H / 1.4); return r0 * (1 - .82 * t) * (1 + 1.6 * foot * (1 + .35 * Math.sin(a * 6 + az))); }, 16, 1.6);
    const knees = o.knees ?? 7, cone = new ConeGeometry(1, 1, 7, 1);
    for (let i = 0; i < knees; i++) { const a = R() * TAU, d = r0 * 3 + R() * 2.2, h = .25 + R() * .45, m = new Matrix4().compose(new Vector3(Math.cos(a) * d, h / 2 - .05, Math.sin(a) * d), new Quaternion(), new Vector3(.08 + R() * .08, h, .08 + R() * .08)); P.trunk.add(cone, m); }
    const list = [], nb = o.branches ?? 32, moss = o.moss !== false; let id = 0;
    for (let i = 0; i < nb; i++) {
      const t = .3 + .66 * i / (nb - 1), c = (t - .3) / .66, at = sp[Math.round(t * 24)], yaw = az + i * GOLD + (R() - .5) * .3;
      const bl = lerp(4.4, .9, Math.pow(c, 1.2)) * (c < .12 ? .75 + c * 2 : 1) * z * (.8 + R() * .4);
      const bp = spine(at, yaw, .06 + R() * .3 + c * .25, bl, 7, -.12 + R() * .25 + (1 - c) * .25, (R() - .5) * .5), br = r0 * .24 * (1 - t * .6);
      trunk(P.trunk, bp, s => br * (1 - .75 * s), 5, 1.6);
      // sprays in pairs along the branch, splayed to either side, some up and some hanging, three at its end
      for (let j = 1; j <= 7; j++) {
        const q = bp[j], d = bp[j].clone().sub(bp[j - 1]), by = Math.atan2(d.z, d.x);
        for (const s of j === 7 ? [-1, 0, 1] : [-1, 1]) {
          const sy = by + s * (.5 + R() * .55) + (R() - .5) * .3, sl = (.85 + R() * .45) * z * (s ? 1 : 1.25);
          const pts = spine(q, sy, (R() - .6) * .7, sl, 4, .25 + R() * .35);
          leaf(P.leaves, pts, u => sl * .27 * Math.pow(Math.sin(Math.PI * clamp(u * .85 + .15, 0, 1)), .6), { fold: .12, id, twist: (R() - .5) * 1.3, colour: [.86 + R() * .16, .93 + R() * .1, .88] });
          list.push(frondOf(id++, pts, sl));
        }
        // a beard of moss now and then: two crossed strips, so it has some body from any side
        if (moss && j < 7 && R() < .3) {
          const ml = (.7 + R() * 1.6) * z, mp = [q.clone().add(new Vector3(0, -.04, 0))]; for (let m = 1; m <= 4; m++) mp.push(mp[0].clone().add(new Vector3((R() - .5) * .1 * m, -ml * m / 4, (R() - .5) * .1 * m)));
          for (const turn of [0, Math.PI / 2]) leaf(P.moss, mp, s => (.08 + .13 * (1 - s)) * z, { id, across: new Vector3(Math.cos(by + turn), 0, Math.sin(by + turn)), colour: [.9 + R() * .2, .9 + R() * .2, .9 + R() * .15] });
          list.push(frondOf(id++, mp, ml));
        }
      }
    }
    return list;
  },
  // reeds round a pond's edge: a clump of tall blades, some bent over, and cattails on stiff stems
  reeds(o, R, P) {
    const H = o.height, n = o.blades ?? 30, cat = o.cattails ?? 4, list = [], head = new CylinderGeometry(.028, .028, .22, 7, 1), m = new Matrix4();
    for (let i = 0; i < n + cat; i++) {
      const isCat = i >= n, a = R() * TAU, d = Math.sqrt(R()) * .3, root = new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), len = H * (isCat ? 1 : .55 + R() * .45);
      const pts = spine(root, R() * TAU, isCat ? 1.52 : 1.25 + R() * .3, len, 8, isCat ? .05 : R() * R() * 1.4), w = isCat ? .007 : .012 + R() * .01;
      leaf(P.leaves, pts, () => w, { fold: .2, id: i, colour: isCat ? [.8, .82, .6] : [1, .95 + R() * .1, .9 + R() * .1] });
      list.push(frondOf(i, pts, len));
      if (isCat) { const q = pts[6], dir = pts[7].clone().sub(pts[5]).normalize(); m.compose(q, new Quaternion().setFromUnitVectors(UP, dir), new Vector3(1, 1, 1)); P.fruit.add(head, m, [1, 1, 1]); }
    }
    return list;
  },
  // flowers: a low clump of leaves, stems and heads of petals (petals: a colour, or a list to pick from)
  flowers(o, R, P) {
    const H = o.height, n = o.stems ?? 9, list = [], petals = [].concat(o.petals ?? ['#e8487a', '#f2c03a', '#ffffff', '#9a6ad8'][Math.floor(R() * 4)]).map(rgb);
    for (let i = 0; i < 7; i++) { const a = R() * TAU, pts = spine(new Vector3(), a, .45 + R() * .4, H * .5 * (.7 + R() * .4), 5, .6); leaf(P.leaves, pts, s => .025 * Math.sin(Math.PI * clamp(s, .1, 1)) + .006, { fold: .3, id: i }); list.push(frondOf(i, pts, H * .5)); }
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * .12, root = new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), len = H * (.7 + R() * .4), pts = spine(root, R() * TAU, 1.35 + R() * .2, len, 5, R() * .4);
      leaf(P.leaves, pts, () => .005, { id: 10 + i, colour: [.85, 1, .8] }); list.push(frondOf(10 + i, pts, len));
      // the head, facing up and a little out, on the stem's top
      const top = pts.at(-1), s = (.05 + R() * .04) * Math.max(.6, H / .5), c = petals[Math.floor(R() * petals.length)], tilt = new Vector3(Math.cos(a) * .4, 1, Math.sin(a) * .4).normalize();
      const X = new Vector3().crossVectors(tilt, new Vector3(Math.sin(a), 0, -Math.cos(a))).normalize(), Z = new Vector3().crossVectors(X, tilt), f = [root.x, root.y, root.z, 1], fi = [10 + i, len], b = P.flowers.n;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) P.flowers.vert(top.clone().addScaledVector(X, (u - .5) * s * 2).addScaledVector(Z, (v - .5) * s * 2).addScaledVector(tilt, .01), tilt, u, v, c, f, fi);
      P.flowers.tri(b, b + 1, b + 2); P.flowers.tri(b, b + 2, b + 3);
    }
    return list;
  },
  // lily pads lying on still water (the plant's foot is the water's surface), and a flower or two among them
  lily(o, R, P) {
    const n = o.pads ?? 8, list = [], spread = o.spread ?? 1.2, petals = rgb(o.petals ?? (R() < .5 ? '#fbf6f0' : '#f0a0c0'));
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * spread, c = new Vector3(Math.cos(a) * d, .005 + i * .0015, Math.sin(a) * d), r = .14 + R() * .2, turn = R() * TAU, b = P.leaves.n;
      // a disc in rings, the rim curling up a little
      const ring = 10, f = [c.x, c.y, c.z, 0], fi = [i, r];
      P.leaves.vert(c, UP, .5, .5, [1, 1, 1], f, fi);
      for (let k = 0; k <= ring; k++) for (const q of [.6, 1]) { const t = k / ring * TAU + turn; P.leaves.vert(new Vector3(c.x + Math.cos(t) * r * q, c.y + (q === 1 ? .012 : 0), c.z + Math.sin(t) * r * q), UP, .5 + Math.cos(k / ring * TAU) * .5 * q, .5 + Math.sin(k / ring * TAU) * .5 * q, [1, 1, 1], f, fi); }
      for (let k = 0; k < ring; k++) { const i0 = b + 1 + k * 2, i1 = i0 + 2; P.leaves.tri(b, i1, i0); P.leaves.tri(i0, i1, i0 + 1); P.leaves.tri(i0 + 1, i1, i1 + 1); }
      list.push({ id: i, root: [c.x, c.y, c.z], dir: [0, 0, 0], len: r });
    }
    for (let i = 0; i < (o.blooms ?? 2); i++) {   // a flower: two crossed rings of petals, cupped
      const a = R() * TAU, d = Math.sqrt(R()) * spread * .8, c = new Vector3(Math.cos(a) * d, .03, Math.sin(a) * d), s = .09;
      for (const [k, lift] of [[0, .35], [.4, .7]]) {
        const b = P.flowers.n, f = [c.x, c.y, c.z, 0], fi = [50 + i, s];
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const x = (u - .5) * s * 2, z = (v - .5) * s * 2, rr = Math.hypot(x, z); P.flowers.vert(new Vector3(c.x + x * Math.cos(k) - z * Math.sin(k), c.y + rr * lift, c.z + x * Math.sin(k) + z * Math.cos(k)), UP, u, v, petals, f, fi); }
        P.flowers.tri(b, b + 2, b + 1); P.flowers.tri(b, b + 3, b + 2);
      }
    }
    return list;
  },
};
// one leaf as listed for whatever moves leaves next: where it starts, the way it points, how long it is
function frondOf(id, pts, len) { const d = pts.at(-1).clone().sub(pts[0]).normalize(); return { id, root: [pts[0].x, pts[0].y, pts[0].z], dir: [d.x, d.y, d.z], len }; }

// A fan palm's leaf: segments spread round three quarters of a circle from the stalk's end, folded up and down
// in pleats, the far edge drooping. at: where the stalk ends; dir: the stalk's way there.
function fanLeaf(out, at, dir, R0, Rr, { id, root, lead, len, droop }) {
  const side = new Vector3().crossVectors(dir, UP); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
  const fwd = dir.clone(); fwd.y = Math.max(fwd.y, -.2) * .4; fwd.normalize(); const nrm = new Vector3().crossVectors(side, fwd).normalize(), A = 18, rings = [0, .25, .55, .8, 1], base = out.n, p = new Vector3();
  for (const q of rings) for (let k = 0; k <= A; k++) {
    const a = (k / A - .5) * 1.56 * Math.PI, x = Math.sin(a) * q, y = Math.cos(a) * q, pleat = (k % 2 ? 1 : -1) * .07 * q * R0 * (q > .2 ? 1 : 0);
    p.copy(at).addScaledVector(side, x * R0).addScaledVector(fwd, y * R0).addScaledVector(nrm, pleat + .12 * R0 * q).add(new Vector3(0, -droop * q * q * R0, 0));
    out.vert(p, nrm, .5 + x * .5, .5 + y * .5, [1, 1, 1], [root.x, root.y, root.z, clamp((lead + q * R0) / len, 0, 1)], [id, len]);
  }
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < A; k++) { const a = base + r * (A + 1) + k, b = a + A + 1; out.tri(a, b, a + 1); out.tri(a + 1, b, b + 1); }
}

/* ---------- materials and the plant itself ---------- */
const mats = new Map(), made = new Map(), fieldIds = new WeakMap(); let fieldN = 0;
const fieldId = f => { if (!f) return 0; let i = fieldIds.get(f); if (!i) fieldIds.set(f, i = ++fieldN); return i; };
const fieldOf = bend => bend ? (bend.grass?.texture ? bend.grass : bend.texture ? bend : null) : null;   // (a gs.outdoors.Marks, or its grass field)
function leafMat(pic, colour, wind, clock, sway, part) {
  const k = [pic, colour, typeof wind === 'number' ? wind : 'w' + fieldId(wind), sway, fieldId(part)].join('|');
  if (mats.has(k)) return mats.get(k);
  const map = plantTexture(pic), m = new MeshStandardMaterial({ map, color: colour, alphaTest: .5, side: DoubleSide, roughness: .72, vertexColors: true });
  looks.fronds(m, { time: clock.lkTime, wind: wind ?? clock.lkWind, sway, glow: .45, atlas: map.userData.atlas, part });
  m.name = 'plants:' + pic; mats.set(k, m);
  return m;
}
const plainMats = new Map();
const plain = (c, rough = .7) => { const k = c + rough; if (!plainMats.has(k)) { const m = pbr(c, { rough }); m.vertexColors = true; plainMats.set(k, m); } return plainMats.get(k); };

/**
 * One of the plants above as a Group (its foot at y = 0): 'branches' (trunk, stems), 'leaves', and for some
 * 'fruit', 'flowers', 'moss'. o: height, seed, leaves / bark (colours), wind, bend (a gs.outdoors.Marks: brushed
 * aside by whoever walks through), and per kind: palm (lean, fronds, dead, fruit), fan (fronds, skirt), banana
 * (fronds), fern (trunk: metres for a tree fern, fronds), taro (fronds), cypress (branches, knees, moss: false or
 * a colour), reeds (blades, cattails), flowers (stems, petals), lily (pads, blooms, petals, spread).
 * clock: the shared sway clock ({ lkTime, lkWind }), tick: the onBeforeRender that moves it (trees.js).
 */
export function plant(kind, o, clock, tick) {
  const K = KIND[kind], { seed = 0, height = K.height, leaves = K.leaves, bark = K.bark, wind, bend } = o, part = fieldOf(bend);
  const key = JSON.stringify([kind, seed, height, leaves, bark, typeof wind === 'number' ? wind : !!wind, fieldId(part), o.lean, o.fronds, o.dead, o.fruit, o.skirt, o.trunk, o.branches, o.knees, o.moss, o.blades, o.cattails, o.stems, o.petals, o.pads, o.blooms, o.spread]);
  let parts = made.get(key);
  if (!parts) {
    pause('Models');   // (while a card loads, a frame may go by before each new plant: slices.js)
    const R = rand(seed * 7919 + kind.length * 31 + 5), P = { trunk: new Parts(), leaves: new Parts(), fruit: new Parts(), flowers: new Parts(), moss: new Parts() };
    const list = GROW[kind]({ ...o, height, leaves }, R, P);
    const trunkMat = kind === 'palm' || kind === 'fan' ? material('palm', { colour: bark, repeat: [1, 1] }) : kind === 'cypress' || (kind === 'fern' && o.trunk) ? material('bark', { colour: bark, repeat: [2, 1] }) : plain(bark);
    parts = {
      list,
      trunk: P.trunk.empty ? null : [P.trunk.geometry(false), trunkMat],
      leaves: [P.leaves.geometry(), leafMat(K.pic, leaves, wind, clock, K.sway, part)],
      fruit: P.fruit.empty ? null : [P.fruit.geometry(false), plain(kind === 'reeds' ? '#4a3020' : '#5a4a22', .55)],
      flowers: P.flowers.empty ? null : [P.flowers.geometry(), leafMat('petals', '#ffffff', wind, clock, K.sway, part)],
      moss: P.moss.empty ? null : [P.moss.geometry(), leafMat('moss', typeof o.moss === 'string' ? o.moss : '#9aa684', wind, clock, .12, part)],
    };
    if (made.size >= 48 && !loading()) made.delete(made.keys().next().value);
    made.set(key, parts); built();
  }
  const out = new Group(); out.name = 'tree:' + kind; out.userData.tree = kind; out.userData.fronds = parts.list;
  for (const [name, part] of [['branches', parts.trunk], ['leaves', parts.leaves], ['fruit', parts.fruit], ['flowers', parts.flowers], ['moss', parts.moss]]) {
    if (!part) continue;
    const m = new Mesh(part[0], part[1]); m.name = name; m.castShadow = kind !== 'lily'; m.receiveShadow = true;
    if (name !== 'branches' && name !== 'fruit') m.onBeforeRender = tick;
    out.add(m);
  }
  return out;
}

/* ---------- ivy ---------- */
const grown = new Map();   // ivy already grown: the same targets and options again give it back
/**
 * Ivy grown over meshes (walls, a house, a tree stump, a statue): vines that start at the foot of the walls (or
 * from: [[x, y, z], ...]) and climb, keeping to the surface, branching, going over edges and hanging where
 * there is nothing to hold, with leaves that face out from the wall, bigger where the vine is older. targets:
 * a mesh, a group, or a list (their world places as they are now). o: seed, roots (how many vines start: 8),
 * length (metres each may climb: 5), leaves (colour), stem (colour), size (a leaf, metres: .13), density
 * (leaf clusters per 10 cm of vine: 1.2; one to three leaves each), up (how hard they climb rather than wander: 1), wind, bend. A Group in world
 * metres ('branches': the vines, 'leaves'); userData.ivy says how much grew ({ vines, metres, leaves }).
 * About 30 to 120 ms: make it while loading.
 */
export function ivy(targets, o = {}, clock, tick) {
  const { seed = 1, roots = 8, from = null, length = 5, leaves = '#3e6a2a', stem = '#4d3c2c', size = .13, density = 1.2, up = 1, wind, bend } = o, part = fieldOf(bend);
  // what it grows on, as one soup of triangles in world metres
  const geos = []; let n = 0;
  for (const t of [].concat(targets)) { t.updateMatrixWorld?.(true); t.traverse?.(m => { if (m.isMesh && m.geometry?.attributes.position) { const g = new BufferGeometry().setAttribute('position', m.geometry.attributes.position.clone()); if (m.geometry.index) g.setIndex(m.geometry.index.clone()); g.applyMatrix4(m.matrixWorld); const q = g.index ? g.toNonIndexed() : g; geos.push(q); n += q.attributes.position.count; } }); }
  const pos = new Float32Array(n * 3); let o3 = 0; for (const g of geos) { pos.set(g.attributes.position.array, o3); o3 += g.attributes.position.array.length; g.dispose(); }
  let sig = 0; for (let i = 0; i < pos.length; i += 7) sig = (sig * 31 + Math.round(pos[i] * 100)) | 0;
  const key = JSON.stringify([n, sig, seed, roots, from, length, leaves, stem, size, density, up, typeof wind === 'number' ? wind : fieldId(wind), fieldId(part)]);
  let got = grown.get(key);
  if (!got) {
    pause('Models');
    try { got = growIvy(pos, n, { seed, roots, from, length, size, density, up }); }
    finally { built(); }
    if (grown.size >= 8 && !loading()) grown.delete(grown.keys().next().value);
    grown.set(key, got);
  }
  const out = new Group(); out.name = 'ivy'; out.userData.ivy = { ...got.info };
  if (got.vines) { const m = new Mesh(got.vines, plain(stem, .85)); m.name = 'branches'; m.castShadow = false; m.receiveShadow = true; out.add(m); }
  if (got.leaves) { const m = new Mesh(got.leaves, leafMat('ivy', leaves, wind, clock, .05, part)); m.name = 'leaves'; m.castShadow = true; m.receiveShadow = true; m.onBeforeRender = tick; out.add(m); }
  return out;
}
function growIvy(pos, n, { seed, roots, from, length, size, density, up }) {
  const R = rand(seed * 131 + 17), info = { vines: 0, metres: 0, leaves: 0 };
  if (!n) return { info, vines: null, leaves: null };
  const soup = new BufferGeometry(); soup.setAttribute('position', new Float32BufferAttribute(pos, 3)); soup.computeBoundingBox();
  const bvh = new MeshBVH(soup), box = soup.boundingBox, hit = {}, nrm = new Vector3(), A = new Vector3(), B = new Vector3(), C = new Vector3();
  const tri = (a, b, c) => { A.fromArray(pos, a * 3); B.fromArray(pos, b * 3); C.fromArray(pos, c * 3); return nrm.subVectors(C, B).cross(A.sub(B)).normalize(); };
  // a triangle's normal by its place in the soup, and by a hit's faceIndex (the tree keeps its own order of the triangles)
  const faceN = f => tri(f * 3, f * 3 + 1, f * 3 + 2), idx = soup.index?.array, hitN = f => idx ? tri(idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]) : faceN(f);
  // which way is out from a point on the surface: a ray out crosses the surface an even number of times (none, for a wall alone)
  // (a little off square, so it doesn't run along an edge, and a hit on the edge two triangles share counted once)
  const ray = new Ray(), outward = (p, n) => {
    ray.origin.copy(p).addScaledVector(n, .002); ray.direction.copy(n).add(new Vector3(.031, .017, -.023)).normalize();
    let k = 0, last = -1; for (const h of bvh.raycast(ray, DoubleSide).sort((a, b) => a.distance - b.distance)) { if (h.distance - last > 1e-4) k++; last = h.distance; }
    return k % 2 ? n.negate() : n;
  };
  // where vines start: given, or on walls (steep faces) near the lowest ground they stand on
  const starts = [];
  if (from) for (const p of from) { const q = new Vector3(...(Array.isArray(p) ? p : [p.x, p.y, p.z])); bvh.closestPointToPoint(q, hit); const at = hit.point.clone(); starts.push([at, outward(at, hitN(hit.faceIndex).clone())]); }
  else {
    const walls = [], areas = []; let total = 0;
    for (let f = 0; f < n / 3; f++) {
      const nn = faceN(f); if (Math.abs(nn.y) > .3) continue;
      const lo = Math.min(pos[f * 9 + 1], pos[f * 9 + 4], pos[f * 9 + 7]); if (lo > box.min.y + .6) continue;
      A.fromArray(pos, f * 9); B.fromArray(pos, f * 9 + 3); C.fromArray(pos, f * 9 + 6); const ar = B.clone().sub(A).cross(C.clone().sub(A)).length() / 2; if (ar < 1e-4) continue;
      walls.push(f); total += ar; areas.push(total);
    }
    for (let i = 0; i < roots && walls.length; i++) {
      const pick = R() * total; let k = 0; while (areas[k] < pick) k++;
      const f = walls[k], u = R(), v = R() * (1 - u); A.fromArray(pos, f * 9); B.fromArray(pos, f * 9 + 3); C.fromArray(pos, f * 9 + 6);
      const p = A.clone().multiplyScalar(1 - u - v).addScaledVector(B, u).addScaledVector(C, v); p.y = Math.min(A.y, B.y, C.y) + .03;
      starts.push([p, outward(p, faceN(f).clone())]);
    }
  }
  const S = new Parts(), L = new Parts(), step = .05, gl = new Vector3(), side = new Vector3(), vines = starts.map(([p, nn]) => ({ p, n: nn, d: UP.clone(), lean: null, left: length * (.7 + R() * .5), age: 1 }));
  let id = 0;
  while (vines.length) {
    const v = vines.shift(), pts = [v.p.clone()], ns = [v.n.clone()], p = v.p.clone(), d = v.d.clone(), nn = v.n.clone(), vid = id++; let free = 0, since = 0;
    for (let s = 0; s < v.left / step; s++) {
      bvh.closestPointToPoint(p, hit);
      const near = hit.distance < .35;
      if (near) { const was = nn.clone(); nn.copy(hitN(hit.faceIndex)); const k = nn.dot(gl.subVectors(p, hit.point)); if (k < -1e-5 || (k < 1e-5 && nn.dot(was) < 0)) nn.negate(); free = 0; } else free++;   // (on the surface itself: the side it was on)
      // the way on: up and a little wander, kept along the surface; with nothing to hold, it falls
      d.multiplyScalar(2).add(new Vector3((R() - .5) * 1.2, up * (near ? .9 : 0), (R() - .5) * 1.2));
      if (v.lean && near) d.addScaledVector(v.lean, .7);   // (a side shoot keeps spreading the way it set off)
      if (near) d.addScaledVector(nn, -d.dot(nn)); else d.add(new Vector3(0, -1.6, 0));
      if (d.lengthSq() < 1e-6) d.copy(UP); d.normalize();
      p.addScaledVector(d, step);
      if (near) { bvh.closestPointToPoint(p, hit); const k = gl.subVectors(p, hit.point); p.copy(hit.point).addScaledVector(k.lengthSq() > 1e-8 ? k.normalize() : nn, .012); }
      pts.push(p.clone()); ns.push(nn.clone());
      if (free > 14) break;
      // leaves on it, facing out from the wall, drooping a little, bigger on old wood
      since += step * density * 10 * (.6 + R() * .8);
      if (since >= 1 && info.leaves < 9000) {   // a cluster of one to three, the older the vine the more and bigger
        since = 0; side.crossVectors(d, nn).normalize();
        for (let k = 0, c = 1 + (R() < .55) + (R() < v.age * .5); k < c; k++) { leafAt(L, k ? gl.copy(p).addScaledVector(side, (R() - .5) * .12).addScaledVector(d, (R() - .5) * .08) : p, nn, d, size * (.6 + .55 * v.age) * (.75 + R() * .5), R, vid * 1000 + s); info.leaves++; }
      }
      // a side shoot now and then, spreading out sideways and up
      if (near && R() < .06 && vines.length < 600) { const a = (R() < .5 ? -1 : 1) * (.7 + R() * .7), sd = d.clone().applyAxisAngle(nn, a); vines.push({ p: p.clone(), n: nn.clone(), d: sd, lean: sd.clone(), left: (v.left - s * step) * .62, age: v.age * .72 }); }
    }
    if (pts.length > 2) {   // the vine itself: a thin strip lying on the surface, tapering to its tip (every other point: leaves hide most of it)
      for (let i = pts.length - 2; i > 0; i -= 2) { pts.splice(i, 1); ns.splice(i, 1); }
      const b = S.n;
      for (let i = 0; i < pts.length; i++) {
        const t = i / (pts.length - 1), w = .009 * v.age * (1 - .7 * t) + .002, q = pts[i], dd = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
        side.crossVectors(dd, ns[i]).normalize();
        S.vert(q.clone().addScaledVector(side, -w), ns[i], 0, i * step * 8); S.vert(q.clone().addScaledVector(side, w), ns[i], 1, i * step * 8);
      }
      for (let i = 0; i < pts.length - 1; i++) { const a = b + i * 2; S.tri(a, a + 2, a + 1); S.tri(a + 1, a + 2, a + 3); }
      info.metres += (pts.length - 1) * step * 2;
    }
  }
  info.vines = id; info.metres = +info.metres.toFixed(1);
  return { info, vines: S.empty ? null : S.geometry(false), leaves: L.empty ? null : L.geometry() };
}
// an ivy leaf: a card on a short stalk, out from the wall, its tip turned down and a little to either side
function leafAt(out, p, n, d, s, R, id) {
  const tipDir = new Vector3(0, -1, 0).addScaledVector(n, .8 + R() * .6).addScaledVector(d, .3 * (R() - .5) * 2).normalize();
  const across = new Vector3().crossVectors(n, tipDir).normalize(), face = new Vector3().crossVectors(tipDir, across).normalize();
  if (face.dot(n) < 0) face.negate();
  const base = p.clone().addScaledVector(n, .01), f = [p.x, p.y, p.z, 0], fi = [id, s], b = out.n;
  const a = (R() - .5) * .5; across.applyAxisAngle(face, a);
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const q = base.clone().addScaledVector(across, (u - .5) * s).addScaledVector(tipDir, v * s); f[3] = v; out.vert(q, face, u, v, [1, 1, 1], [...f], fi); }
  out.tri(b, b + 1, b + 2); out.tri(b, b + 2, b + 3);
}

/* ---------- weeds ---------- */
/**
 * Weeds that grow where nobody weeds: along cracks and kerbs (lines: [[[x, z], [x, z], ...], ...] or points with
 * y), at the foot of walls (walls: meshes, a group or a list; weeds where their steep faces meet the ground) and
 * at spots ([[x, y, z], ...]). ground(x, z): the height to plant at (default: the line's own y, the wall's foot,
 * or 0). gap: metres between weeds along a line (.4; some gaps left bare), height (a weed, metres: .22),
 * colours ([a green, another, a dry one]), seed, wind, bend, max (weeds at most: 2000). One InstancedMesh of
 * tufts (a rosette of toothed leaves, blades of grass, now and then a flower head), each turned and sized its
 * own way. userData.weeds: how many. Cheap: one draw, about 40 triangles a weed.
 */
export function weeds(o = {}, clock, tick) {
  const { lines = [], walls = null, spots = [], ground = null, gap = .4, height = .22, colours = ['#5e8a3a', '#7f9a46', '#a09a58'], seed = 3, wind, bend, max = 2000 } = o;
  const R = rand(seed * 977 + 1), at = [], up = new Vector3();
  const yAt = (x, z, y) => ground ? ground(x, z) : y ?? 0;
  for (const ln of lines) {
    const P = ln.map(p => p.length === 3 ? new Vector3(p[0], p[1], p[2]) : new Vector3(p[0], NaN, p[1]));
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = R() * gap; s < l; s += gap * (.5 + R())) {
        if (R() < .3) continue;   // (bare stretches)
        const t = s / l, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = isNaN(a.y) ? undefined : a.y + (b.y - a.y) * t;
        at.push([x, yAt(x, z, y), z, null]);
      }
    }
  }
  if (walls) {
    const nn = new Vector3(), A = new Vector3(), B = new Vector3(), C = new Vector3();
    for (const t of [].concat(walls)) {
      t.updateMatrixWorld?.(true);
      t.traverse?.(m => {
        if (!m.isMesh) return;
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, P = g.attributes.position, mid = new Box3().setFromObject(m).getCenter(new Vector3());
        for (let f = 0; f < P.count; f += 3) {
          A.fromBufferAttribute(P, f).applyMatrix4(m.matrixWorld); B.fromBufferAttribute(P, f + 1).applyMatrix4(m.matrixWorld); C.fromBufferAttribute(P, f + 2).applyMatrix4(m.matrixWorld);
          nn.subVectors(C, B).cross(up.subVectors(A, B)).normalize(); if (Math.abs(nn.y) > .25) continue;
          if (nn.x * (A.x - mid.x) + nn.z * (A.z - mid.z) < 0) nn.negate();   // (out from the wall, whichever way its triangles wind)
          // the face's lowest edge: weeds along it, if it stands on the ground
          const [lo1, lo2] = [A, B, C].sort((p, q) => p.y - q.y), foot = yAt(lo1.x, lo1.z, lo1.y);
          if (Math.abs(lo1.y - foot) > .12 || Math.abs(lo2.y - lo1.y) > .12) continue;
          const l = Math.hypot(lo2.x - lo1.x, lo2.z - lo1.z);
          for (let s = R() * gap; s < l; s += gap * (.6 + R() * 1.2)) { if (R() < .35) continue; const k = s / l, x = lo1.x + (lo2.x - lo1.x) * k + nn.x * .04, z = lo1.z + (lo2.z - lo1.z) * k + nn.z * .04; at.push([x, yAt(x, z, lo1.y), z, Math.atan2(nn.z, nn.x)]); }
        }
        if (g !== m.geometry) g.dispose();
      });
    }
  }
  for (const s of spots) at.push([s[0], s.length > 2 ? s[1] : yAt(s[0], s[1]), s.length > 2 ? s[2] : s[1], null]);
  const n = Math.min(max, at.length), geo = weedTuft(R), mat = leafMat('weed', '#ffffff', wind, clock, .08, fieldOf(bend));
  const mesh = new InstancedMesh(geo, mat, Math.max(1, n)); mesh.name = 'weeds'; mesh.count = n; mesh.castShadow = false; mesh.receiveShadow = true; mesh.onBeforeRender = tick;
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
  const cs = colours.map(c => new Color(c)), c = new Color(), m = new Matrix4(), q = new Quaternion();
  for (let i = 0; i < n; i++) {
    const [x, y, z, out] = at[i], s = height / .22 * (.55 + R() * .8), turn = out ?? R() * TAU;
    m.compose(new Vector3(x, y - .005, z), q.setFromAxisAngle(UP, -turn + (R() - .5) * 1.2), new Vector3(s, s * (.8 + R() * .5), s)); mesh.setMatrixAt(i, m);
    c.copy(cs[0]).lerp(cs[1], R()); if (cs[2] && R() < .3) c.lerp(cs[2], .5 + R() * .5); c.multiplyScalar(.85 + R() * .3); mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere(); mesh.userData.weeds = n;
  return mesh;
}
// one weed tuft (the weed picture: a toothed leaf on its left half, a blade, a flower head top right), .22 m tall
function weedTuft(R) {
  const P = new Parts();
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + R() * .4, len = .1 + R() * .06, pts = spine(new Vector3(), a, .25 + R() * .45, len, 3, -.1); leaf(P, pts, () => .025, { fold: .25, u0: 0, u1: .5, id: i }); }
  for (let i = 0; i < 6; i++) { const a = R() * TAU, len = .12 + R() * .1, pts = spine(new Vector3(Math.cos(a) * .02, 0, Math.sin(a) * .02), a, 1.05 + R() * .35, len, 3, .5); leaf(P, pts, () => .009, { u0: .53, u1: .72, id: 10 + i }); }
  // a stalk with a flower head, standing above the rest
  const pts = spine(new Vector3(), R() * TAU, 1.45, .22, 3, .1); leaf(P, pts, () => .022, { u0: .76, u1: 1, v0: 0, v1: .82, id: 20 });
  return P.geometry();
}
