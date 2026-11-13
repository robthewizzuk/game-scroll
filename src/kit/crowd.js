// gs.props.Crowd: hundreds of animated people or animals for the cost of a few draws (Next Gen).
//
// A person drawn the usual way (gs.models.human, gs.poses.person, gs.models.creature) is a skinned mesh
// with a skeleton of its own: its pose is worked out bone by bone in JavaScript every frame, its bones
// are sent to the graphics chip, and it is a draw (or seven) by itself. Fine for a squad, not for a
// street, a stand full of fans or a herd.
// A crowd writes each kind's movement down once instead: every move it will make (walk, run, cheer...)
// is played through and where each bone is in each frame goes into a texture, a row a frame. From then
// on a member of the crowd is five numbers for the graphics chip (where, which way, how big, which two
// rows of the texture and how far between them) and every one of a kind at one level of detail is drawn
// in a single draw, bent into its pose by the vertex shader. Nothing is posed in JavaScript.
//
//   const { Crowd } = gs.props, { human } = gs.models;
//   make()   { human.all([{ seed: 1 }, { seed: 2 }]);                                   // sculpted first, as for any human()
//              crowd = new Crowd(view, { of: [human({ seed: 1 }), human({ seed: 2 })], moves: ['idle', 'walk', 'run', 'wave'] }); }
//   reset()  { crowd.clear(); for (let i = 0; i < 300; i++) crowd.add({ x, z, turn, kind: i % 2, move: 'walk', size: .95 + R() * .1 }); }
//   update(dt) {
//     for (const p of crowd.list) { p.x += Math.sin(p.turn) * 1.3 * dt; p.z += Math.cos(p.turn) * 1.3 * dt; }   // move them as your game likes
//     crowd.update(dt);                                                                  // after the camera has moved
//   }
//
// What it looks after by itself: a stride that follows how far each one really moved (feet don't slide),
// a short blend when a move changes, who is in view (the rest are not sent at all), how finely each is
// drawn for its size on screen (the kind's own detail levels, or simpler shapes made here), shadows on
// both backends, and where each was last frame for frame generation and SGSR 2.
// Not in it: faces, fur and hair strands, hands onto things, feet planted on slopes (give each its
// ground height as y), and anything else that needs a skeleton: for the one the player is looking at,
// take a member out (hide it) and stand a real human() in its place.
// The WebGL shader edit is the 'crowd' look below; crowd-gpu.js crowdLook is the same as nodes.
import { timed } from './prof.js';
import { BufferAttribute, Color, DataTexture, DynamicDrawUsage, FloatType, Frustum, Group, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBuffer, InterleavedBufferAttribute, Matrix4, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshDistanceMaterial, MeshNormalMaterial, NearestFilter, NoBlending, RGBAFormat, Sphere, Vector3 } from 'three';
import { lookPatch, looksOf, lookSpec } from './looks.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { HD } from './hd3d.js';
import { sameList } from './slim.js';
import { skin8 } from './slim-core.js';

const CYCLE = 32, FPS = 24, FADE = .25, STRIDE = 20;   // rows a stride cycle, rows a second for moves by the clock, seconds a blend takes, numbers a member
const FINE = .15, KEEP = 1.4, NOMINAL = 800;            // triangles a member wants for each pixel of its height, squared (of a screen 800 high: triangles about two pixels across); a level is kept until one 1.4 times as fine would do
const APART = 4, LAST = 500;                            // levels are at most this many times apart in triangles (more are made between); the coarsest has about this many
const TIER = [.5, .75, 1, 1];                           // how tall a member counts as, by quality tier (as human().see())
const M4 = new Matrix4(), INV = new Matrix4(), PS = new Matrix4(), FR = new Frustum(), BALL = new Sphere(), V = new Vector3();

/* ---------- the look (WebGL): a vertex takes its pose from two rows of the kind's texture ---------- */
const HEAD = `attribute vec4 gsAt, gsCrowd, gsTint, gsSkinI, gsSkinW;
uniform highp sampler2D gsBake;
varying vec3 vGsTint;
mat4 gsBone(float i, float row) {
  int x = int(i + .5) * 3, y = int(row + .5);
  vec4 a = texelFetch(gsBake, ivec2(x, y), 0), b = texelFetch(gsBake, ivec2(x + 1, y), 0), c = texelFetch(gsBake, ivec2(x + 2, y), 0);
  return mat4(a.x, b.x, c.x, 0., a.y, b.y, c.y, 0., a.z, b.z, c.z, 0., a.w, b.w, c.w, 1.);
}
mat4 gsPose(float row) {
  mat4 m = gsBone(gsSkinI.x, row) * gsSkinW.x;
  if (gsSkinW.y > 0.) m += gsBone(gsSkinI.y, row) * gsSkinW.y;
  if (gsSkinW.z > 0.) m += gsBone(gsSkinI.z, row) * gsSkinW.z;
  if (gsSkinW.w > 0.) m += gsBone(gsSkinI.w, row) * gsSkinW.w;
  return m;
}
mat4 gsCrowdM() {
  mat4 m = gsPose(gsCrowd.x);
  if (gsCrowd.z > 0.) m = m * (1. - gsCrowd.z) + gsPose(gsCrowd.y) * gsCrowd.z;
  float c = cos(gsAt.w) * gsCrowd.w, s = sin(gsAt.w) * gsCrowd.w;
  return mat4(c, 0., -s, 0., 0., gsCrowd.w, 0., 0., s, 0., c, 0., gsAt.xyz, 1.) * m;
}
`;
const AT = c => `#include <${c}>`;
const crowdSpec = (uniforms, depth = false) => ({
  uniforms, vertexHead: HEAD, fragmentHead: depth ? '' : 'varying vec3 vGsTint;\n',
  vertex: [
    [AT('uv_vertex'), 'after', '\n  mat4 gsM = gsCrowdM(); vGsTint = gsTint.rgb;'],
    [AT('beginnormal_vertex'), 'after', '\n  objectNormal = normalize(mat3(gsM) * objectNormal);\n#ifdef USE_TANGENT\n  objectTangent = normalize(mat3(gsM) * objectTangent);\n#endif'],
    [AT('begin_vertex'), 'after', '\n  transformed = (gsM * vec4(transformed, 1.)).xyz;'],
  ],
  fragment: depth ? [] : [[AT('color_fragment'), 'after', '\n  diffuseColor.rgb *= vGsTint;']],
});

/* ---------- a kind: one figure's moves written into a texture, and its shapes ---------- */
// The figure stands at the origin, unturned and full size, while each move is played through.
function bake(src, moves) {
  const rig = src.rig, meshes = (src.lods || [src.mesh]).filter(Boolean), sk = meshes[0]?.skeleton;
  if (!rig?.pace || !sk) throw new Error('gs.props.Crowd: each of `of` is a figure with a rig and a skinned mesh (gs.models.human, gs.poses.person, gs.models.creature)');
  const B = sk.bones.length, was = { par: src.parent, p: src.position.clone(), q: src.quaternion.clone(), s: src.scale.clone(), layers: rig.layers, weight: rig.weight, on: rig.blendOn, k: rig.blendK, bw: rig.bw, top: rig.top, topOn: rig.topOn, topW: rig.topW, fadeT: rig.fadeT };
  const size = src.scale.y || 1, lod = src.lod, steps = rig.steps, momentum = rig.momentum, follow = rig.follow, face = rig.face, lead = rig.lead, manner = rig.manner;
  if (lod) src.lod = 0;   // (a person seen from further off leaves its small bones, fingers and toes, out of the scene: every bone is wanted here)
  src.removeFromParent(); src.position.set(0, 0, 0); src.quaternion.identity(); src.scale.setScalar(1);
  const plan = {}; let rows = 0;
  for (const name of moves) {
    const pace = rig.pace(name); if (!pace || plan[name]) continue;
    const still = !pace.rate && !(pace.per > 0), n = still ? 1 : pace.rate ? CYCLE : Math.max(8, Math.min(64, Math.ceil(FPS / pace.per)));
    const loop = !still && !pace.once;
    plan[name] = { base: rows, n, loop, rate: pace.rate, per: pace.per, once: pace.once }; rows += n + (loop ? 1 : 0);
  }
  if (!rows) throw new Error('gs.props.Crowd: none of the moves ' + moves.join(', ') + ' is a pose of this figure\'s rig');
  const W = B * 3, data = new Float32Array(W * rows * 4), bind = meshes[0].bindMatrix;   // (three texels a bone: the rows of its 3 by 4 matrix)
  const write = row => {
    src.updateMatrixWorld(true); sk.update(); INV.copy(meshes[0].matrixWorld).invert();
    for (let b = 0; b < B; b++) {
      const e = M4.fromArray(sk.boneMatrices, b * 16).premultiply(INV).multiply(bind).elements, o = (row * W + b * 3) * 4;
      data[o] = e[0]; data[o + 1] = e[4]; data[o + 2] = e[8]; data[o + 3] = e[12];
      data[o + 4] = e[1]; data[o + 5] = e[5]; data[o + 6] = e[9]; data[o + 7] = e[13];
      data[o + 8] = e[2]; data[o + 9] = e[6]; data[o + 10] = e[10]; data[o + 11] = e[14];
    }
  };
  rig.weight = 0; rig.blendOn = false; rig.blendK = 0; rig.bw = null; rig.top = null; rig.topOn = false; rig.topW = 0; rig.fadeT = 0; rig.steps = false;   // (the moves as they are drawn: no feet kept where they stood,
  rig.momentum = false; follow?.reset(); rig.follow = null; face?.still?.(); rig.face = null; lead?.reset(); rig.lead = null; rig.manner = null;   // nothing carried over from the move before, nothing swinging, and a face at rest: eyes open, mouth shut)
  for (const name in plan) {
    const m = plan[name], total = m.n + (m.loop ? 1 : 0);
    for (let f = 0; f < total; f++) {
      rig.layers = [{ name, w: 1, phase: m.loop ? (f % m.n) / m.n : m.n > 1 ? f / (m.n - 1) : 0, pin: true }];
      rig.update(0); write(m.base + f);
    }
  }
  // the figure back as it was given
  Object.assign(rig, { layers: was.layers, weight: was.weight, blendOn: was.on, blendK: was.k, bw: was.bw, top: was.top, topOn: was.topOn, topW: was.topW, fadeT: was.fadeT, steps, momentum, follow, face, lead, manner }); if (rig.mom) rig.mom.has = rig.mom.live = false; rig.update(0);
  src.position.copy(was.p); src.quaternion.copy(was.q); src.scale.copy(was.s); was.par?.add(src); if (lod) src.lod = lod; src.updateMatrixWorld(true);
  return { data, W, plan, bones: B, rows, size, meshes };
}
// A shape for the crowd: the figure's own points, with its bones and weights as plain numbers a vertex
// (the same on both backends), no blend shapes, and room for the members' numbers.
function crowdGeo(g, seen = new Map()) {
  // (the figure's own numbers, in lists of the crowd's own, each kept the way the figure keeps it, slim.js: freeing a
  // shape frees its lists on the chip, and the figure may still be drawn)
  // seen: the lists already made for this kind, so a figure's levels of detail, which are other triangles of the same points,
  // send those points to the chip once between them, as the figure does
  const own = a => { let b = seen.get(a); if (!b) seen.set(a, b = sameList(a, seen)); return b; };
  const o = new InstancedBufferGeometry(); if (g.index) o.setIndex(own(g.index));
  for (const k of ['position', 'normal', 'uv', 'uv1', 'color', 'tangent']) if (g.attributes[k]) o.setAttribute(k, own(g.attributes[k]));
  // bone numbers and weights: eight bytes a point (sixteen for a figure of more than 256 bones), the weights adding up to one
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = si.count; let skin = seen.get(si);
  if (!skin) {
    const I = new Float32Array(n * 4), Wt = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const q = i * 4; I[q] = si.getX(i); I[q + 1] = si.getY(i); I[q + 2] = si.getZ(i); I[q + 3] = si.getW(i); Wt[q] = sw.getX(i); Wt[q + 1] = sw.getY(i); Wt[q + 2] = sw.getZ(i); Wt[q + 3] = sw.getW(i); }
    seen.set(si, skin = new InterleavedBuffer(skin8(I, Wt, n).array, 8));   // (one list for both: WebGPU takes eight lists a shape at most)
  }
  o.setAttribute('gsSkinI', new InterleavedBufferAttribute(skin, 4, 0, false)); o.setAttribute('gsSkinW', new InterleavedBufferAttribute(skin, 4, 4, true));
  for (const gr of g.groups) o.addGroup(gr.start, gr.count, gr.materialIndex);
  o.instanceCount = 0; o.boundingSphere = new Sphere(new Vector3(), 1e-3);
  return o;
}
const trisOf = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
// A coarser shape from a crowd's shape: the same points (the same lists on the chip), about `keep` of its triangles,
// material by material. null if the simplifier is not in yet.
function thinned(geo, keep) {
  const P = geo.attributes.position, ix = geo.index?.array; if (!ix) return null;
  const pos = P.isInterleavedBufferAttribute || P.itemSize !== 3 || !(P.array instanceof Float32Array) ? Float32Array.from({ length: P.count * 3 }, (_, i) => P.getComponent(i / 3 | 0, i % 3)) : P.array;
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: ix.length, materialIndex: 0 }], parts = []; let n = 0;
  try {
    for (const g of groups) {
      const sub = Uint32Array.from(ix.subarray(g.start, g.start + g.count)), [res] = MeshoptSimplifier.simplify(sub, pos, 3, Math.max(3, Math.floor(sub.length * keep / 3) * 3), 1, ['LockBorder']);
      parts.push({ res, start: n, materialIndex: g.materialIndex }); n += res.length;
    }
  } catch (_) { return null; }
  const out = P.count > 65535 ? new Uint32Array(n) : new Uint16Array(n), o = new InstancedBufferGeometry();
  for (const p of parts) { out.set(p.res, p.start); if (geo.groups.length) o.addGroup(p.start, p.res.length, p.materialIndex); }
  o.setIndex(new BufferAttribute(out, 1));
  for (const k in geo.attributes) if (!geo.attributes[k].data?.isInstancedInterleavedBuffer) o.setAttribute(k, geo.attributes[k]);
  o.instanceCount = 0; o.boundingSphere = new Sphere(new Vector3(), 1e-3);
  return o;
}
// Where a shape's points are in one row of a kind's moves, worked out here as the shader does it: [x0, y0, z0, x1, y1, z1].
// (How big a member is as it stands, for leaving it out of view and for ray(); and the kit test checks the rows with it.)
export function posedBox(g, data, W, row, each = null) {
  const P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], I = [0, 0, 0, 0], Wt = [0, 0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); let px = 0, py = 0, pz = 0;
    I[0] = si.getX(i); I[1] = si.getY(i); I[2] = si.getZ(i); I[3] = si.getW(i); Wt[0] = sw.getX(i); Wt[1] = sw.getY(i); Wt[2] = sw.getZ(i); Wt[3] = sw.getW(i);
    let sum = Wt[0] + Wt[1] + Wt[2] + Wt[3]; if (!(Wt[0] > 0)) { Wt[0] = 1; Wt[1] = Wt[2] = Wt[3] = 0; sum = 1; }
    for (let j = 0; j < 4; j++) {
      const w = Wt[j] / sum; if (!(w > 0)) continue;
      const o = (row * W + I[j] * 3) * 4;
      px += w * (data[o] * x + data[o + 1] * y + data[o + 2] * z + data[o + 3]); py += w * (data[o + 4] * x + data[o + 5] * y + data[o + 6] * z + data[o + 7]); pz += w * (data[o + 8] * x + data[o + 9] * y + data[o + 10] * z + data[o + 11]);
    }
    if (px < box[0]) box[0] = px; if (py < box[1]) box[1] = py; if (pz < box[2]) box[2] = pz; if (px > box[3]) box[3] = px; if (py > box[4]) box[4] = py; if (pz > box[5]) box[5] = pz;
    each?.(i, px, py, pz);
  }
  return box;
}

/**
 * A crowd in a Next Gen view. of: the figures its members are copies of, one a kind (each a human(),
 * person() or creature() made for the crowd: it is not put in the scene); moves: the poses of their rigs
 * the members will use (the first is what a new member does); far: metres past which none is drawn;
 * shadows: whether they cast them; reach: how far out of view (metres) a member is still drawn, for
 * its shadow and for a camera that turns before the next update.
 */
export class Crowd {
  constructor(view, { of = [], moves = ['idle', 'walk', 'run'], far = 160, shadows = true, reach = 5 } = {}) {
    this.view = view; this.scene = view.scene || view; this.far = far; this.reach = reach; this.shadows = shadows; this.moves = moves.slice();
    this.list = []; this.made = 0; this.visible = true;
    this.age = 0; this.hooked = false;   // frames the view has drawn since the last update(); whether a view tells us (frame())
    /** Set to 0, 1 or 2 to draw every member at that one of its figure's own levels of detail (null: by size on screen). */
    this.lod = null;
    /** What the last update() drew: members, how many were sent to be drawn, how many at each level of detail, draws and triangles a frame. */
    this.info = { members: 0, drawn: 0, levels: [], draws: 0, triangles: 0 };
    const srcs = [].concat(of); if (!srcs.length) throw new Error('gs.props.Crowd: give it at least one figure, { of: [human(...)] }');
    // every kind's moves in one texture, a kind under the last (so all the kinds share their shaders)
    const baked = srcs.map(src => bake(src, this.moves)), W = Math.max(...baked.map(b => b.W)), rows = baked.reduce((n, b) => n + b.rows, 0), data = new Float32Array(W * rows * 4);
    let at = 0; for (const b of baked) {
      // (how big it stands in its first move, by its coarsest shape: its arms are out as it was sculpted)
      const g = b.meshes[b.meshes.length - 1].geometry; b.box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const f of [0, .25, .5, .75]) { const m = Object.values(b.plan)[0], bx = posedBox(g, b.data, b.W, m.base + Math.min(m.n - 1, Math.floor(f * m.n))); for (let i = 0; i < 3; i++) { b.box[i] = Math.min(b.box[i], bx[i]); b.box[i + 3] = Math.max(b.box[i + 3], bx[i + 3]); } }
      for (let r = 0; r < b.rows; r++) data.set(b.data.subarray(r * b.W * 4, (r + 1) * b.W * 4), (at + r) * W * 4); for (const n in b.plan) b.plan[n].base += at; at += b.rows; b.data = null;
    }
    const tex = this.tex = new DataTexture(data, W, rows, RGBAFormat, FloatType); tex.minFilter = tex.magFilter = NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const U = this.uniforms = { gsBake: { value: tex } }, mats = this.mats = new Map();
    // each of the figures' materials with the look added (a copy: the figure's own may be on a skinned mesh too; people share theirs, so the kinds share the copies)
    const mat = m => { let c = mats.get(m); if (c) return c; c = m.clone(); c.userData = { ...m.userData, gsCrowd: true }; delete c.userData.gsLooks; delete c.userData.gsGpu; for (const n of looksOf(m)) lookPatch(c, n, lookSpec(m, n)); lookPatch(c, 'crowd', crowdSpec(U)); mats.set(m, c); return c; };
    // plain materials that know the poses: for the shadow maps, and for the pictures of depth, normals and what is shiny that WebGL's ambient occlusion and reflections draw (drawPosed)
    const plain = m => { m.userData.gsCrowd = true; lookPatch(m, 'crowd', crowdSpec(U, true)); return m; };
    const depth = this.depth = plain(new MeshDepthMaterial()), dist = this.dist = plain(new MeshDistanceMaterial());
    this.normal = plain(new MeshNormalMaterial({ blending: NoBlending })); this.black = plain(new MeshBasicMaterial({ color: 0 }));
    const group = this.group = new Group(); group.name = 'gs-crowd'; this.scene.add(group); (this.scene.userData.gsPosed ||= new Set()).add(this);
    this.kinds = baked.map(b => {
      // its shapes, finest first: the figure's own levels of detail, with more made between any two of them over four times apart
      // in triangles, and after its last down to about 500 (a figure's own coarsest is made for a squad, not for hundreds a few pixels tall)
      const seen = new Map(), own = b.meshes.map((m, i) => ({ geo: crowdGeo(m.geometry, seen), material: m.material, own: i })), shapes = [];
      own.forEach((o, i) => {
        shapes.push(o);
        const next = own[i + 1], t = trisOf(o.geo), to = next ? trisOf(next.geo) : t > LAST * 2 ? LAST : 0; let from = o, tt = t;
        while (to && tt / to > APART) { const g = thinned(from.geo, Math.sqrt(to / tt)); if (!g || trisOf(g) > tt * .8) break; from = { geo: g, material: o.material, own: -1 }; tt = trisOf(g); shapes.push(from); }
        if (!next && to && tt > to * 1.5) { const g = thinned(from.geo, to / tt); if (g && trisOf(g) < tt * .8) shapes.push({ geo: g, material: o.material, own: -1 }); }
      });
      // h: how tall it stands; r: a ball round it whatever its move (a stride reaches further than it stands); w: how thick it is, for ray()
      const [x0, y0, z0, x1, y1, z1] = b.box, h = Math.max(.2, y1 - Math.min(0, y0)), ex = x1 - x0, ez = z1 - z0, r = Math.hypot(h / 2, Math.max(ex, ez) / 2) * 1.5;
      const k = { plan: b.plan, size: b.size, h, r, w: (ex + ez) / 2, cy: h / 2, levels: [], own: [] };
      for (const s of shapes) {
        const geo = s.geo, mesh = new Mesh(geo, Array.isArray(s.material) ? s.material.map(mat) : mat(s.material));
        if (s.own >= 0) k.own[s.own] = k.levels.length;
        mesh.name = 'gs-crowd'; mesh.castShadow = this.shadows; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.visible = false; mesh.raycast = () => {};
        mesh.customDepthMaterial = depth; mesh.customDistanceMaterial = dist;
        // (its ball is kept round the members it draws, and it says when they moved: hd3d.js shadowLights; the rest is for big still meshes)
        Object.assign(mesh.userData, { gsMoved: 0, gsBall: true, noBatch: true, noLod: true, noOcclude: true, noContact: true, detail: false });
        const lv = { mesh, geo, n: 0, cap: 0, buf: null, a: null, held: -1, tris: trisOf(geo), draws: Array.isArray(s.material) ? Math.max(1, geo.groups.length) : 1 };
        // WebGL: drawn with a material that is not the crowd's (a pass that draws everything with one material of its own), every
        // member would stand unposed at the middle of the world: it draws nothing then. (WebGPU hands such a pass the crowd's own nodes.)
        mesh.onBeforeRender = (r, sc, cam, g, m) => { if (r.isWebGLRenderer && !m.userData.gsCrowd) { lv.held = g.instanceCount; g.instanceCount = 0; } };
        mesh.onAfterRender = (r, sc, cam, g) => { if (lv.held >= 0) { g.instanceCount = lv.held; lv.held = -1; } };
        this.grow(lv, 64); k.levels.push(lv); group.add(mesh);
      }
      return k;
    });
  }
  // room for more members at a level (the numbers move to a bigger list)
  grow(lv, cap) {
    const a = new Float32Array(cap * STRIDE); if (lv.a) a.set(lv.a.subarray(0, lv.n * STRIDE));
    const buf = new InstancedInterleavedBuffer(a, STRIDE, 1); buf.setUsage(DynamicDrawUsage);
    ['gsAt', 'gsCrowd', 'gsTint', 'gsAtWas', 'gsCrowdWas'].forEach((name, i) => lv.geo.setAttribute(name, new InterleavedBufferAttribute(buf, 4, i * 4)));
    delete lv.geo._maxInstanceCount;   // (WebGL keeps the first list's length as the most it will draw)
    lv.a = a; lv.buf = buf; lv.cap = cap;
  }
  /**
   * Adds a member: { x, y, z, turn (radians, as rotation.y: 0 faces +z), kind (which of `of`), move, size,
   * tint (a colour its own are multiplied by), phase (0..1: where in its move it starts; by default each
   * starts somewhere else, so a crowd is out of step), data (yours) }. Returns it: change its x, y, z,
   * turn, move, size, tint and hide as you like, then call update(). done turns true when a move that
   * plays once has ended.
   */
  add(o = {}) {
    const kind = Math.max(0, Math.min(this.kinds.length - 1, o.kind | 0)), plan = this.kinds[kind].plan;
    const p = { x: o.x || 0, y: o.y || 0, z: o.z || 0, turn: o.turn || 0, kind, move: plan[o.move] ? o.move : Object.keys(plan)[0], size: o.size ?? 1, tint: new Color(o.tint ?? '#ffffff'), hide: false, done: false,
      phase: o.phase ?? (this.made * .618034) % 1, data: o.data, c: { m: null, from: 0, fade: 1, x: 0, y: 0, z: 0, lv: -1, was: new Float32Array(8), now: new Float32Array(8), seen: false } };
    this.made++; this.list.push(p); return p;
  }
  /** Takes a member out. */
  remove(p) { const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1); return this; }
  /** Takes them all out (call in reset()). */
  clear() { this.list.length = 0; this.made = 0; for (const k of this.kinds) for (const lv of k.levels) { lv.n = 0; lv.geo.instanceCount = 0; lv.mesh.visible = false; } return this; }
  /** The members within r metres of (x, z). */
  near(x, z, r, out = []) { out.length = 0; const r2 = r * r; for (const p of this.list) { const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz <= r2) out.push(p); } return out; }
  /**
   * The first member a ray meets (a shot, a tap through the camera): origin and dir as { x, y, z } (dir of length 1),
   * far: how far it reaches. Each member counts as an upright rounded post as tall as it stands. Returns
   * { member, distance, height (0 at its feet .. 1 at the top of its head) } or null.
   */
  ray(origin, dir, far = Infinity) {
    let best = null;
    for (const p of this.list) {
      if (p.hide) continue;
      const k = this.kinds[p.kind], s = k.size * p.size, h = k.h * s, r = Math.max(.12, k.w * s * .5);
      // nearest approach of the ray to the member's upright middle line (from its feet to the top of its head)
      const wx = origin.x - p.x, wy = origin.y - p.y, wz = origin.z - p.z, b = dir.y, d = dir.x * wx + dir.y * wy + dir.z * wz, e = wy, den = 1 - b * b;
      let t = den > 1e-6 ? (b * e - d) / den : 0; if (t < 0) t = 0;
      let u = Math.max(0, Math.min(h, wy + dir.y * t)); t = Math.max(0, -(wx * dir.x + (wy - u) * dir.y + wz * dir.z)); u = Math.max(0, Math.min(h, wy + dir.y * t));
      const qx = wx + dir.x * t, qy = wy + dir.y * t - u, qz = wz + dir.z * t, gap2 = qx * qx + qy * qy + qz * qz;
      if (gap2 > r * r || t > far) continue;
      const dist = Math.max(0, t - Math.sqrt(r * r - gap2));
      if (!best || dist < best.distance) best = { member: p, distance: dist, height: h ? u / h : 0 };
    }
    return best;
  }
  /**
   * Each frame, after the members and the camera have moved: steps each one's move (a walk or run by how
   * far it went, the rest by the clock), picks who is in view and how finely, and sends their numbers.
   */
  update(dt = 0) {
    const cam = this.view.cam || this.view.camera, I = this.info, far2 = this.far * this.far;
    // "last frame" is the last frame drawn, not the last update: a game on a fixed tick updates twice between two frames, or not at all
    const roll = !this.hooked || this.age > 0; this.age = 0;
    for (const k of this.kinds) for (const lv of k.levels) lv.n = 0;
    let fr = null, cx = 0, cy = 0, cz = 0, pxAt1 = 1;
    if (cam) {
      cam.updateMatrixWorld(); PS.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr = FR.setFromProjectionMatrix(PS, cam.coordinateSystem, cam.reversedDepth).planes;
      const e = cam.matrixWorld.elements; cx = e[12]; cy = e[13]; cz = e[14];
      pxAt1 = NOMINAL / (2 * Math.tan((cam.fov || 50) * Math.PI / 360)) * (TIER[HD.tier] ?? 1);   // pixels a metre stands tall, a metre away
    }
    I.members = this.list.length; I.drawn = 0;
    for (const p of this.list) {
      const k = this.kinds[p.kind], c = p.c, plan = k.plan; let m = plan[p.move]; if (!m) { p.move = c.m || Object.keys(plan)[0]; m = plan[p.move]; }
      // its move: a new one starts (in step, if both follow the ground) and blends in; then on by the ground covered or by the clock
      if (c.m !== p.move) {
        const old = plan[c.m]; if (old) { c.from = rowOf(old, p.phase, true); c.fade = 0; if (!(old.rate && m.rate)) p.phase = 0; } else c.fade = 1;
        c.m = p.move; p.done = false; c.x = p.x; c.y = p.y; c.z = p.z;
      }
      const moved = Math.hypot(p.x - c.x, p.z - c.z); c.x = p.x; c.y = p.y; c.z = p.z;
      const step = m.rate ? moved * m.rate / (k.size * p.size || 1) : m.per * dt;
      if (m.loop) p.phase = (p.phase + step) % 1; else if (m.n > 1) { p.phase = Math.min(1, p.phase + step); p.done = p.phase >= 1; } else p.done = !!m.once;
      if (c.fade < 1) c.fade = Math.min(1, c.fade + dt / FADE);
      if (p.hide || !this.visible) { c.seen = false; continue; }
      // in view, near enough? (a ball round it, and `reach` more)
      const s = k.size * p.size, dx = p.x - cx, dy = p.y + k.cy * s - cy, dz = p.z - cz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > far2) { c.seen = false; continue; }
      if (fr) { const r = k.r * s + this.reach, x = p.x, y = p.y + k.cy * s, z = p.z; let out = false; for (let i = 0; i < 4 && !out; i++) { const pl = fr[i]; out = pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -r; } if (out) { c.seen = false; continue; } }
      // how finely: the coarsest level with triangles enough for how tall it stands on screen (one already in use is kept a little longer, so none flickers between two)
      const px = k.h * s * pxAt1 / Math.max(.1, Math.sqrt(d2)), L = k.levels, want = px * px * FINE; let lv = L.length - 1;
      if (this.lod != null) lv = k.own[Math.max(0, Math.min(k.own.length - 1, this.lod | 0))];
      else { while (lv > 0 && L[lv].tris < want) lv--; if (lv > c.lv && c.lv >= 0) { let l2 = lv; while (l2 > c.lv && L[l2].tris < want * KEEP) l2--; lv = l2; } }
      c.lv = lv;
      const T = k.levels[lv]; if (T.n >= T.cap) this.grow(T, Math.max(T.cap * 2, 2 ** Math.ceil(Math.log2(this.list.length))));   // (room for them all at once: a list that grows leaves its old one on the chip)
      // its numbers: where and which way, the two rows and how far between them, how big; its colour; and the same as the last frame drew them
      const a = T.a, o = T.n++ * STRIDE; let rowA, rowB, mix;
      if (c.fade < 1) { const t = c.fade; rowA = c.from; rowB = rowOf(m, p.phase, true); mix = t * t * (3 - 2 * t); }
      else { const f = m.loop ? p.phase * m.n : p.phase * (m.n - 1), i0 = Math.min(Math.floor(f), m.loop ? m.n - 1 : Math.max(0, m.n - 1)); rowA = m.base + i0; rowB = m.base + Math.min(i0 + 1, m.loop ? m.n : m.n - 1); mix = rowB === rowA ? 0 : f - i0; }
      a[o] = p.x; a[o + 1] = p.y; a[o + 2] = p.z; a[o + 3] = p.turn; a[o + 4] = rowA; a[o + 5] = rowB; a[o + 6] = mix; a[o + 7] = s;
      a[o + 8] = p.tint.r; a[o + 9] = p.tint.g; a[o + 10] = p.tint.b; a[o + 11] = 1;
      const w = c.was, nw = c.now;
      if (!c.seen) { for (let i = 0; i < 8; i++) w[i] = a[o + i]; c.seen = true; } else if (roll) w.set(nw);
      for (let i = 0; i < 8; i++) { a[o + 12 + i] = w[i]; nw[i] = a[o + i]; }
      I.drawn++;
    }
    // each level: how many to draw, the ball round them, and a count that says they moved
    I.draws = 0; I.triangles = 0; I.levels.length = 0;
    for (const k of this.kinds) k.levels.forEach((lv, li) => {
      const n = lv.n, a = lv.a; lv.geo.instanceCount = n; lv.mesh.visible = n > 0; I.levels[li] = (I.levels[li] || 0) + n;
      if (!n) return;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, big = 0, sum = n;
      for (let i = 0; i < n; i++) {
        const o = i * STRIDE, x = a[o], y = a[o + 1], z = a[o + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; if (a[o + 7] > big) big = a[o + 7];
        sum += (x * 1.3 + y * 1.7 + z * 2.3 + a[o + 3] * 2.9 + a[o + 4] * 3.1 + a[o + 5] * 3.7 + a[o + 6] * 4.1 + a[o + 7] * 4.3) * (i % 7 + 1);
      }
      BALL.center.set((x0 + x1) / 2, (y0 + y1) / 2 + k.cy * big, (z0 + z1) / 2); BALL.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + k.r * big + .2;
      lv.geo.boundingSphere.copy(BALL);
      lv.buf.clearUpdateRanges(); lv.buf.addUpdateRange(0, n * STRIDE); lv.buf.needsUpdate = true;
      if (sum !== lv.sum) { lv.sum = sum; lv.mesh.userData.gsMoved++; }   // (the shadow maps draw them again only when one of them moved or stepped on in its move)
      I.draws += lv.draws; I.triangles += lv.tris * n;
    });
    return this;
  }
  // Kit use: the view says it is about to draw a frame. One drawn with no update() since the last shows nobody moving:
  // the numbers "as the last frame drew them" become the ones it drew (or frame generation would carry everyone on).
  frame() {
    this.hooked = true; if (this.age++ !== 1) return;
    for (const k of this.kinds) for (const lv of k.levels) {
      const a = lv.a, n = lv.n; let changed = false;
      for (let i = 0; i < n; i++) { const o = i * STRIDE; for (let j = 0; j < 8; j++) if (a[o + 12 + j] !== a[o + j]) { a[o + 12 + j] = a[o + j]; changed = true; } }
      if (changed) { lv.buf.clearUpdateRanges(); lv.buf.addUpdateRange(0, n * STRIDE); lv.buf.needsUpdate = true; }
    }
  }
  // WebGL, kit use (hd3d.js drawPosed): the members into a picture the view has just drawn of everything else with one
  // material: their normals and depth ('normal'), or black ('black': not shiny, in the reflections' picture of what is)
  drawPosed(r, cam, rt, how) {
    if (!this.info.drawn || !this.visible) return;
    const m = how === 'black' ? this.black : this.normal, keep = this.keep ||= [], auto = r.autoClear; keep.length = 0;
    for (const k of this.kinds) for (const lv of k.levels) { keep.push(lv.mesh.material); lv.mesh.material = m; }
    r.autoClear = false; r.setRenderTarget(rt);
    try { r.render(this.group, cam); } finally { let i = 0; for (const k of this.kinds) for (const lv of k.levels) lv.mesh.material = keep[i++]; r.autoClear = auto; }
  }
  /** Takes the crowd out of the scene and frees what it made. */
  dispose() {
    for (const k of this.kinds) for (const lv of k.levels) { lv.mesh.removeFromParent(); lv.geo.dispose(); }
    this.group.removeFromParent(); this.scene.userData.gsPosed?.delete(this);
    for (const m of this.mats.values()) m.dispose(); for (const m of [this.depth, this.dist, this.normal, this.black]) m.dispose(); this.tex.dispose();
    this.kinds.length = 0; this.list.length = 0;
  }
}
// the row of a move's texture nearest a phase
function rowOf(m, phase, round) { const f = m.loop ? phase * m.n : phase * (m.n - 1), i = round ? Math.round(f) : Math.floor(f); return m.base + Math.max(0, Math.min(m.loop ? m.n : m.n - 1, i)); }

// per-frame work, timed while the frame lab is open (prof.js)
timed(Crowd.prototype, 'update', 'crowds');
