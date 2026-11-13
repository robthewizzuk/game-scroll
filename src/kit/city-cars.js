// gs.city's traffic drawn as real cars (gs.models.vehicle): a few draws for the whole fleet.
//
// Each style of car the city uses is made once and taken apart into a kit: its paint (coloured car by car),
// everything else that doesn't glow (glass, chrome, rubber, the dark trim, the plate: one material, each
// surface's roughness and metal read from a small table by its UVs, so they all share one draw), its head
// lamps and tail lamps, and its wheel. Close to the player (the nearest few within `reach` metres) a car is
// drawn whole: its own meshes, wheels that roll and steer, a body that dips as it brakes and leans out in a
// turn, tail lamps that brighten when it brakes. Further off every car of a style is a copy in two
// instanced meshes of a simpler shape (its paint, and the rest with its wheels), and its lamps are city.js's
// own glowing boxes, so a far street at night is still lit by them.
//
// A close-up car is a new object each time one comes close (never one reused from another car): the
// motion the WebGPU view works out for frame generation and SGSR 2 comes from where a thing was drawn last
// frame, so a reused one would streak from the last car's place.
// Kit use only: city.js's Traffic draws through it (City option fleet).
import { BufferAttribute, BufferGeometry, Color, DataTexture, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  NearestFilter, NoColorSpace, Object3D, Quaternion, RGBAFormat, Vector3 } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { vehicle } from './models/vehicles.js';
import { simplifyReady } from './props.js';
import { sendUsed } from './gpu.js';
import { pause, built } from './slices.js';

/** The styles of car each kind of city drives (the first is the commonest). */
export const CITY_CARS = {
  downtown: ['saloon', 'hatch', 'estate', 'van', 'sports'],
  oldtown: ['hatch', 'saloon', 'estate', 'van'],
  harbour: ['van', 'hatch', 'pickup', 'estate', 'saloon'],
  suburb: ['estate', 'hatch', 'saloon', 'pickup', 'sports'],
};

// roughness (g) and metalness (b) of each surface that shares the 'rest' material, a texel each
const PAL_N = 32, palData = new Uint8Array(PAL_N * 4).fill(255), PAL = [];
let palTex = null;
function palette() {
  if (!palTex) { palTex = new DataTexture(palData, PAL_N, 1, RGBAFormat); palTex.magFilter = palTex.minFilter = NearestFilter; palTex.generateMipmaps = false; palTex.colorSpace = NoColorSpace; palTex.needsUpdate = true; }
  return palTex;
}
function palIndex(rough, metal) {
  const r = Math.round(rough * 20) / 20, m = Math.round(metal * 20) / 20;
  let i = PAL.findIndex(p => p[0] === r && p[1] === m);
  if (i < 0) {
    if (PAL.length >= PAL_N) { let best = 0, bd = 9; PAL.forEach((p, k) => { const d = Math.abs(p[0] - r) + Math.abs(p[1] - m) * 2; if (d < bd) { bd = d; best = k; } }); return best; }
    i = PAL.length; PAL.push([r, m]); palData[i * 4] = 255; palData[i * 4 + 1] = Math.round(r * 255); palData[i * 4 + 2] = Math.round(m * 255); palData[i * 4 + 3] = 255;
    if (palTex) palTex.needsUpdate = true;
  }
  return i;
}
// one of a car's surfaces as plain float arrays (whatever slim.js made of them), moved by its place in the car,
// its colour in its corners (times what wear() put there) and, for the shared material, its row in the table
function plain(mesh, root, { colour = null, pal = -1, keepColour = true } = {}) {
  const g0 = mesh.geometry, n = g0.attributes.position.count, M = new Matrix4();   // (root null: as the mesh's own)
  if (root) M.copy(mesh.matrixWorld).premultiply(new Matrix4().copy(root.matrixWorld).invert());
  const g = new BufferGeometry(), P = new Float32Array(n * 3), N = new Float32Array(n * 3), v = new Vector3();
  const nm = new Matrix4().copy(M).invert().transpose(), pa = g0.attributes.position, na = g0.attributes.normal, ca = g0.attributes.color;
  for (let i = 0; i < n; i++) {
    v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(M); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    if (na) { v.set(na.getX(i), na.getY(i), na.getZ(i)).transformDirection(nm); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; }
  }
  g.setAttribute('position', new BufferAttribute(P, 3)); g.setAttribute('normal', new BufferAttribute(N, 3));
  if (!na) g.computeVertexNormals();
  if (keepColour) {
    const C = new Float32Array(n * 3), k = colour || new Color(1, 1, 1);
    for (let i = 0; i < n; i++) { C[i * 3] = k.r * (ca ? ca.getX(i) : 1); C[i * 3 + 1] = k.g * (ca ? ca.getY(i) : 1); C[i * 3 + 2] = k.b * (ca ? ca.getZ(i) : 1); }
    g.setAttribute('color', new BufferAttribute(C, 3));
  }
  if (pal >= 0) { const U = new Float32Array(n * 2), u = (pal + .5) / PAL_N; for (let i = 0; i < n; i++) { U[i * 2] = u; U[i * 2 + 1] = .5; } g.setAttribute('uv', new BufferAttribute(U, 2)); }
  const idx = g0.index; g.setIndex(idx ? Array.from(idx.array) : [...Array(n).keys()]);
  return g;
}
// a far copy's shape: its corners joined where they meet (a car's parts are loose triangles), cut to keep of
// its triangles, flat shaded (smooth normals over so few would round a car's edges off)
function farShape(geo, keep) {
  let g = geo.clone(); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  if (canKeep) {
    const pos = g.attributes.position, p = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i); }
    const idx = new Uint32Array(g.index.array), target = Math.max(3, Math.floor(idx.length * keep / 3) * 3);
    let [out] = MeshoptSimplifier.simplify(idx, p, 3, target, .05, []);
    if (out.length > target * 1.5) out = MeshoptSimplifier.simplifySloppy(idx, p, 3, null, target, .05)[0];
    g.setIndex(Array.from(out));
  }
  g = g.toNonIndexed(); g.computeVertexNormals();
  return g;
}
const join = list => list.length ? (list.length === 1 ? list[0] : mergeGeometries(list, false)) : null;

const KITS = new Map();
let canKeep = false; simplifyReady.then(() => { canKeep = true; });   // (before the simplifier is in, the far shapes aren't simpler: not ones to keep)
/** A style of car taken apart for the city (made once, kept). */
export function carKit(style) {
  let k = KITS.get(style); if (k) return k;
  pause('Models');
  const v = vehicle('car', { style, seed: 3, colour: '#ffffff', finish: 'gloss' }); v.updateMatrixWorld(true);
  const paint = [], rest = [], head = [], tail = [], wheelsFar = [];
  let paintMat = null;
  for (const m of v.shell.children) {
    if (!m.isMesh || m.isInstancedMesh) continue;
    const mt = m.material;
    if (m.name === 'paint') { paint.push(plain(m, v)); paintMat ||= mt; }
    else if (m.name === 'lamp') head.push(plain(m, v, { keepColour: false }));
    else if (m.name === 'tail') tail.push(plain(m, v, { keepColour: false }));
    else rest.push(plain(m, v, { colour: mt.color, pal: palIndex(mt.transparent ? .1 : mt.roughness, mt.metalness) }));
  }
  const W = v.wheels.map(w => { const m = w.children[0]; return { x: w.position.x, y: w.position.y, z: w.position.z, steers: w.steers, flip: m.rotation.y !== 0, r: w.radius }; });
  const wm = v.wheels[0].children[0], wheelMat = wm.material;
  for (const w of v.wheels) wheelsFar.push(plain(w.children[0], v, { colour: wheelMat.color, pal: palIndex(wheelMat.roughness, wheelMat.metalness) }));
  const wheel = plain(wm, null, { colour: wheelMat.color, pal: palIndex(wheelMat.roughness, wheelMat.metalness) });   // (turned on its pivot, and round for the left side, in pose())
  const P = join(paint), R = join(rest), lampAt = v.points.lampL?.position;
  k = {
    style, rough: !canKeep, size: { ...v.size }, length: v.size.length, width: Math.min(v.size.width, 2), wheelbase: v.wheelbase, lampY: lampAt ? lampAt.y : .6,
    paint: P, rest: R, head: join(head), tail: join(tail), wheel, wheels: W, paintLook: paintMat,
    far: { paint: farShape(P, .12), rest: farShape(join([R, ...wheelsFar].map(g => g.clone())), .1) },
  };
  if (canKeep) KITS.set(style, k);
  built();
  return k;
}

// the materials every city car shares (paint by colour for the close-up ones, which wear clear coat)
const MATS = new Map();
const shared = (key, make) => { let m = MATS.get(key); if (!m) MATS.set(key, m = make()); return m; };
const restMat = () => shared('rest', () => new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 1, roughnessMap: palette(), metalnessMap: palette() }));
function paintMat(look, hex) {
  return shared('paint' + hex, () => { const m = look.clone(); m.color.set(hex ?? '#ffffff'); m.vertexColors = true; return m; });
}
const lampMat = kind => shared(kind, () => kind === 'head' ? new MeshStandardMaterial({ color: '#f2eee2', emissive: new Color('#fff1d0'), emissiveIntensity: .05, roughness: .2 })
  : new MeshStandardMaterial({ color: '#9c1010', emissive: new Color('#ff2414'), emissiveIntensity: kind === 'brake' ? 2.6 : .1, roughness: .25 }));

const _m = new Matrix4(), _q = new Quaternion(), _s = new Vector3(1, 1, 1), _p = new Vector3(), _up = new Vector3(0, 1, 0), _c = new Color(), _w = new Object3D();
const ZERO = new Matrix4().makeScale(0, 0, 0);

/** The drawing of a city's traffic: styles (CITY_CARS), cap (most cars at once), near (how many drawn whole), reach (metres). */
export class Fleet {
  constructor(parent, styles, cap, { near = 6, reach = 32 } = {}) {
    this.parent = parent; this.styles = styles; this.cap = Math.max(1, cap); this.nearMax = near; this.reach = reach;
    this.kits = styles.map(carKit);
    this.group = new Group(); this.group.name = 'city cars'; parent.add(this.group);
    const look = this.kits[0].paintLook, farPaint = shared('farpaint', () => { const m = look.clone(); m.color.set('#ffffff'); m.vertexColors = true; return m; });
    this.far = this.kits.map(k => {
      const mk = (geo, mat, col) => {
        const m = new InstancedMesh(geo, mat, this.cap); m.count = 0; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(DynamicDrawUsage);
        if (col) m.instanceColor = new InstancedBufferAttribute(new Float32Array(this.cap * 3).fill(1), 3);
        m.name = 'cars:' + k.style; this.group.add(m); return m;
      };
      return { paint: mk(k.far.paint, farPaint, true), rest: mk(k.far.rest, restMat(), false), n: 0 };
    });
    this.close = new Map();   // car -> its close-up object
    // made before the simplifier was in: the far copies are as fine as the close ones until it is
    if (this.kits.some(k => k.rough)) simplifyReady.then(() => {
      this.kits = this.kits.map((k, i) => { if (!k.rough) return k; const n = carKit(k.style), F = this.far[i]; F.paint.geometry = n.far.paint; F.rest.geometry = n.far.rest; return n; });
    });
  }
  /** A style for a new car (R: the traffic's random numbers). */
  pick(R) { const n = this.kits.length, r = R(); return Math.min(n - 1, Math.floor(r * r * n * 1.15)); }   // (the first styles commonest)
  /** Gives each car its slot in its style's copies (after the list is made; a car keeps its style and slot for good). */
  assign(list) {
    for (const f of this.far) f.n = 0;
    for (const c of list) { c.slot = this.far[c.style].n++; }
    for (const c of [...this.close.keys()]) this.drop(c);
  }
  kitOf(c) { return this.kits[c.style]; }
  draw(list, night, dt) {
    // which cars are drawn whole: the nearest few within reach (a car already close keeps it a little further)
    const f = this.focus, d2 = this._d2 ||= [];
    d2.length = 0;
    if (f) for (const c of list) { const d = Math.hypot(c.x - f.x, c.z - f.z), r = this.close.has(c) ? this.reach + 6 : this.reach; if (d < r) d2.push([d, c]); }
    d2.sort((a, b) => a[0] - b[0]);
    const want = new Set(d2.slice(0, this.nearMax).map(e => e[1]));
    for (const c of [...this.close.keys()]) if (!want.has(c)) this.drop(c);
    for (const c of want) if (!this.close.has(c)) this.take(c);
    for (const F of this.far) { F.paint.count = F.rest.count = F.n; }
    for (const c of list) {
      const F = this.far[c.style];
      if (this.close.has(c)) { F.paint.setMatrixAt(c.slot, ZERO); F.rest.setMatrixAt(c.slot, ZERO); this.pose(c, this.close.get(c), dt, night); continue; }
      _q.setFromAxisAngle(_up, c.heading + Math.PI); _m.compose(_p.set(c.x, 0, c.z), _q, _s);
      F.paint.setMatrixAt(c.slot, _m); F.rest.setMatrixAt(c.slot, _m); F.paint.setColorAt(c.slot, _c.set(c.colour));
    }
    for (const F of this.far) { sendUsed(F.paint.instanceMatrix, F.n); sendUsed(F.rest.instanceMatrix, F.n); sendUsed(F.paint.instanceColor, F.n); }
    const hm = lampMat('head'), tm = lampMat('tail');
    hm.emissiveIntensity = .05 + night * 3.2; tm.emissiveIntensity = .1 + night * 1.6; lampMat('brake').emissiveIntensity = 2.2 + night * 1.4;
  }
  // a car comes close: its own meshes, made new (see the top)
  take(c) {
    const k = this.kitOf(c), o = new Group(), body = new Group(); o.name = 'car'; o.add(body);
    const mesh = (geo, mat, cast = true) => { const m = new Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; body.add(m); return m; };
    mesh(k.paint, paintMat(k.paintLook, c.colour)); mesh(k.rest, restMat());
    if (k.head) mesh(k.head, lampMat('head'), false);
    const tail = k.tail ? mesh(k.tail, lampMat('tail'), false) : null;
    const wheels = new InstancedMesh(k.wheel, restMat(), k.wheels.length); wheels.castShadow = wheels.receiveShadow = true; wheels.instanceMatrix.setUsage(DynamicDrawUsage); o.add(wheels);
    const rec = { o, body, tail, wheels, odo: c.odo || 0, steer: 0, lean: 0, pitch: 0, h: c.heading, v: c.v };
    this.group.add(o); this.close.set(c, rec);
    this.pose(c, rec, 0, 0);
  }
  drop(c) { const r = this.close.get(c); if (!r) return; r.o.removeFromParent(); r.wheels.dispose(); this.close.delete(c); }
  // a close-up car each frame: where it is, its body on its springs, its wheels, its brake lamps
  pose(c, r, dt, night) {
    const k = this.kitOf(c), o = r.o;
    o.position.set(c.x, 0, c.z); o.rotation.set(0, c.heading + Math.PI, 0);
    if (dt > 0) {
      const ds = Math.max(c.v * dt, 1e-4); let dh = c.heading - r.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const st = Math.max(-.6, Math.min(.6, -Math.atan(k.wheelbase * dh / ds))), h = Math.min(1, dt * 8), a = (c.v - r.v) / dt;
      r.steer += ((c.v > .2 ? st : r.steer) - r.steer) * h;
      r.lean += (Math.max(-.06, Math.min(.06, c.v * c.v * Math.tan(r.steer) / k.wheelbase * .012)) - r.lean) * h;
      r.pitch += (Math.max(-.03, Math.min(.03, a * .006)) - r.pitch) * Math.min(1, dt * 5);
      r.odo += c.v * dt;
    }
    r.h = c.heading; r.v = c.v;
    r.body.rotation.set(r.pitch, 0, r.lean);
    k.wheels.forEach((w, i) => {
      _w.position.set(w.x, w.y, w.z); _w.rotation.order = 'YXZ'; _w.rotation.set(-r.odo / w.r, w.steers ? -r.steer : 0, 0); _w.updateMatrix();
      if (w.flip) _w.matrix.multiply(_m.makeRotationY(Math.PI));
      r.wheels.setMatrixAt(i, _w.matrix);
    });
    r.wheels.instanceMatrix.needsUpdate = true;
    if (r.tail) r.tail.material = lampMat(c.braking ? 'brake' : 'tail');
  }
  /** The style's measures (length, width, lampY) of a car. */
  measure(c) { return this.kitOf(c); }
  dispose() { for (const c of [...this.close.keys()]) this.drop(c); this.group.removeFromParent(); for (const F of this.far) { F.paint.dispose(); F.rest.dispose(); } }
}
