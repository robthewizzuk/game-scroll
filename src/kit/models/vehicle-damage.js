// One road vehicle's own wear and tear (vehicles.js gives every car and lorry these): dirt and rain on its paint and
// glass, dents, glass that crazes or falls out, lamps that break, and the bits of glass that fall to the road.
// A vehicle shares its shapes and materials with its copies until one of these happens to it: then the part
// that changed becomes its own (mend() gives the shared ones back). The looks themselves are vehicle-looks.js.
// Kit use only.
import { BoxGeometry, InstancedMesh, Matrix4, Quaternion, Vector3, Euler, Color, DynamicDrawUsage, InstancedBufferAttribute } from 'three';
import { pbr } from '../hd3d.js';
import { ownLook, lookOf } from './vehicle-looks.js';

const { min, max, abs, hypot, floor, random } = Math;
// what a dent bends (the inside, the wheels and what hangs underneath stay as they are)
const BENDS = new Set(['paint', 'paint2', 'plates', 'chrome', 'dark', 'glass', 'lamp', 'tail', 'plate', 'steel', 'iron', 'rust']);
const P = new Vector3(), Q = new Vector3(), N = new Vector3(), G = new Vector3(), D = new Vector3();
// a crumple of the metal: value noise, -.5..5
const hh = (x, y, z) => { let t = (x * 374761393 + y * 668265263 + z * 1442695041) | 0; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };
function crumple(x, y, z) {
  const ix = floor(x), iy = floor(y), iz = floor(z), fx = x - ix, fy = y - iy, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t, c = (i, j, k) => hh(ix + i, iy + j, iz + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy), l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy), sz) - .5;
}

let bitGeo = null, bitMat = null;
const BIT_MAX = 160;

/**
 * Gives a vehicle (root, with its shell group) its dirt(), wet(), dent(), smash(), hit(), mend() and update().
 * size: { length, height }, clear (ground clearance), lampOf(name): a lamp material that can glow (to own one).
 */
export function wearAndTear(root, shell, { size, clear = .2, lampOf }) {
  const state = { dirt: 0, wet: null, dents: 0, glass: 0, lamps: 0 }, owned = [], geos = [];
  const meshes = name => shell.children.filter(m => m.isMesh && !m.isInstancedMesh && (typeof name === 'string' ? m.name === name : name.has(m.name)));
  // a mesh's material, its own from now on (its car look's settings carried over)
  const own = m => {
    if (!m.userData.gsOwn) {
      m.userData.gsShared = m.material;
      if (m.name === 'lamp' || m.name === 'tail') { const lit = lampOf(m.name); m.userData.gsGlow = lit.emissiveIntensity; m.material = ownLook(lit); m.material.emissiveIntensity = root.userData.lit ? m.userData.gsGlow : 0; }
      else m.material = ownLook(m.material);
      m.userData.gsOwn = true; owned.push(m);
    }
    return lookOf(m.material);
  };
  // the vehicle's own space (its shell's: the body that leans on its springs) from the world's
  const local = p => { root.updateMatrixWorld(true); return shell.worldToLocal(P.set(p.x, p.y, p.z)); };
  const localDir = d => { root.updateMatrixWorld(true); const e = shell.matrixWorld.elements; return D.set(e[0] * d.x + e[1] * d.y + e[2] * d.z, e[4] * d.x + e[5] * d.y + e[6] * d.z, e[8] * d.x + e[9] * d.y + e[10] * d.z).normalize(); };   // (the inverse of a rotation: its transpose)
  const nearest = (list, p) => {   // the corner of these meshes nearest p: { mesh, i, d, n }
    let best = null;
    for (const m of list) { const a = m.geometry.attributes.position, na = m.geometry.attributes.normal; for (let i = 0; i < a.count; i++) { const d = hypot(a.getX(i) - p.x, a.getY(i) - p.y, a.getZ(i) - p.z); if (!best || d < best.d) best = { mesh: m, i, d, n: new Vector3(na.getX(i), na.getY(i), na.getZ(i)).normalize(), at: new Vector3(a.getX(i), a.getY(i), a.getZ(i)) }; } }
    return best;
  };

  /** How dirty it is, 0 (clean) to 1 (caked): road dirt low down and behind, dust on top, a film on the glass. */
  root.dirt = v => {
    if (v === undefined) return state.dirt;
    state.dirt = max(0, min(1, +v || 0));
    for (const m of meshes(new Set(['paint', 'paint2']))) { const U = own(m); if (U?.gsCpA) U.gsCpA.value.y = state.dirt; }
    for (const m of meshes('glass')) { const U = own(m); if (U?.gsCgA) U.gsCgA.value.x = state.dirt * .75; }
    return root;
  };
  /** How wet it is, 0..1 (rain beading on its paint, drops on its glass); null: as the weather says. */
  root.wet = v => {
    if (v === undefined) return state.wet;
    state.wet = v == null ? null : max(0, min(1, +v || 0));
    const w = state.wet == null ? 0 : state.wet;
    for (const m of meshes(new Set(['paint', 'paint2']))) { const U = own(m); if (U?.gsCpA) U.gsCpA.value.z = w; }
    for (const m of meshes('glass')) { const U = own(m); if (U?.gsCgA) U.gsCgA.value.y = w; }
    return root;
  };

  /**
   * A dent where it was hit (a point in the world): the panels there pushed in, a little crumpled, and lit as the new
   * shape is. power (1: a hard knock), dir (the way the blow went, in the world; default: towards the middle of the
   * vehicle), radius, depth (metres; from power by default). Dents add up.
   */
  root.dent = (point, { power = 1, dir = null, radius = null, depth = null } = {}) => {
    const c = local(point).clone(), R = radius ?? .2 + .3 * min(power, 1.5), Dp = depth ?? min(.17, .03 + .09 * power);
    const push = dir ? localDir(dir).clone() : new Vector3(0, size.height * .45, 0).sub(c).normalize();
    // its shape: a hollow with a crisp rim, crumpled in ridges (deeper in the middle)
    const h = (x, y, z) => { const s = hypot(x - c.x, y - c.y, z - c.z) / R; if (s >= 1) return 0; const e = Math.min(1, (1 - s) / .5), f = e * e * (3 - 2 * e); return Dp * f * (1 + 1.1 * f * crumple(x * 11, y * 11, z * 11)); };
    let any = false;
    for (const m of meshes(BENDS)) {
      let g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      if (g.boundingSphere.center.distanceTo(c) > g.boundingSphere.radius + R) continue;
      const a0 = g.attributes.position; let near = false;
      for (let i = 0; i < a0.count && !near; i++) near = hypot(a0.getX(i) - c.x, a0.getY(i) - c.y, a0.getZ(i) - c.z) < R;
      if (!near) continue;
      if (!m.userData.gsOwnGeo) { m.userData.gsSharedGeo = g; m.geometry = g = g.clone(); m.userData.gsOwnGeo = true; geos.push(m); }
      const pa = g.attributes.position, na = g.attributes.normal, e = .012;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), v = h(x, y, z); if (v <= 0) continue;
        // the new normal: the old one tipped by how the dent slopes along the surface (as far as the push goes into it)
        N.set(na.getX(i), na.getY(i), na.getZ(i)).normalize();
        G.set(h(x + e, y, z) - h(x - e, y, z), h(x, y + e, z) - h(x, y - e, z), h(x, y, z + e) - h(x, y, z - e)).multiplyScalar(1 / (2 * e));
        G.addScaledVector(N, -G.dot(N)).multiplyScalar(max(0, -push.dot(N)));
        Q.copy(N).add(G).normalize(); na.setXYZ(i, Q.x, Q.y, Q.z);
        pa.setXYZ(i, x + push.x * v, y + push.y * v, z + push.z * v);
      }
      pa.needsUpdate = na.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox(); any = true;
    }
    if (any) {
      state.dents++;
      // the paint rubbed through round it (on the paint's own material: carpaint's scrapes)
      const s = nearest(meshes('paint'), c);
      if (s && s.d < R) for (const m of meshes(new Set(['paint', 'paint2']))) { const U = own(m); if (!U?.gsCpX) continue; const H = U.gsCpX.value; let i = H.findIndex(q => q.w <= 0); if (i < 0) i = U.gsCpNext = ((U.gsCpNext ?? -1) + 1) % 4; H[i].set(s.at.x, s.at.y, s.at.z, R * .8); U.gsCpXK.value.setComponent(i, Math.min(1, .45 + .5 * power)); }
    }
    return root;
  };

  /**
   * Breaks the glass nearest a point (in the world): a windscreen crazes round it (milky cracks, still in its
   * frame); a side or back window is holed, its glass falling out in bits; a lamp goes dark and cracked. power: how
   * hard (a light knock only cracks). Up to four breaks a pane (the oldest gives way). Returns what broke ('screen',
   * 'window', 'lamp') or null.
   */
  root.smash = (point, { power = 1 } = {}) => {
    const c = local(point).clone(), glass = meshes('glass'), lamps = meshes(new Set(['lamp', 'tail']));
    const g = nearest(glass, c), l = nearest(lamps, c);
    if (l && l.d < .35 && (!g || l.d < g.d)) {   // a lamp
      const U = own(l.mesh); if (!U?.gsCgH) return null;
      put(U, l.at, .09 + .04 * min(power, 1), 3); state.lamps++;
      bits(l.at, l.n, 8 + floor(6 * min(power, 1)), l.mesh.name === 'tail' ? '#b0221a' : '#e8e4da', .9);
      return 'lamp';
    }
    if (!g || g.d > .6) return null;
    const U = own(g.mesh); if (!U?.gsCgH) return null;
    // which pane: the windscreen is the glass across the front (laminated: it crazes and stays); the side and back windows break up
    const gg = g.mesh.geometry; if (!gg.boundingBox) gg.computeBoundingBox();
    const screen = g.at.z < 0 && abs(g.at.x) < gg.boundingBox.max.x * .72, soft = power < .45;
    if (screen || soft) put(U, g.at, (screen ? .12 : .06) + .26 * min(power, 1.4), 1);
    else { put(U, g.at, .3 + .25 * min(power, 1.4), 2); bits(g.at, g.n, 22 + floor(30 * min(power, 1.4)), '#cfe2dd', 1.6); }
    state.glass++;
    return screen ? 'screen' : soft ? 'crack' : 'window';
  };
  const put = (U, at, r, kind) => {
    const H = U.gsCgH.value, K = U.gsCgK.value; let i = H.findIndex(h => h.w <= 0);
    if (i < 0) { i = U.gsCgNext = ((U.gsCgNext ?? -1) + 1) % 4; }
    H[i].set(at.x, at.y, at.z, r); K.setComponent(i, kind);
  };

  /**
   * A knock, all at once: a dent where it landed, the glass nearest it cracked or broken if it was close enough and
   * hard enough, a lamp there broken. point (in the world), power (1: a hard knock), dir (the way it went). Returns
   * what broke as smash() does, or null.
   */
  root.hit = (point, { power = 1, dir = null } = {}) => {
    root.dent(point, { power, dir });
    return power > .25 ? root.smash(point, { power }) : null;
  };

  /** As good as new: its own dents, glass and lamps back to the shared ones, the bits on the road gone (dirt and wet stay). */
  root.mend = () => {
    for (const m of geos) { m.geometry.dispose(); m.geometry = m.userData.gsSharedGeo; delete m.userData.gsSharedGeo; delete m.userData.gsOwnGeo; }
    for (const m of owned) { m.material.dispose(); m.material = m.userData.gsShared; delete m.userData.gsShared; delete m.userData.gsOwn; }
    geos.length = owned.length = 0; state.dents = state.glass = state.lamps = 0;
    if (fall) { fall.im.removeFromParent(); fall.im.dispose(); fall = null; }
    const d = state.dirt, w = state.wet; state.dirt = 0; if (d) root.dirt(d); if (w != null) root.wet(w);
    root.lights(!!root.userData.lit);
    return root;
  };
  Object.defineProperty(root, 'damage', { get: () => ({ dents: state.dents, glass: state.glass, lamps: state.lamps }) });

  // the bits of glass: a few dozen copies of one small piece, falling, bouncing and lying where they land; they live
  // beside the vehicle (in its parent), so they stay on the road when it drives off
  let fall = null;
  const M4 = new Matrix4(), QQ = new Quaternion(), EE = new Euler(), S1 = new Vector3(1, 1, 1), W = new Vector3(), CC = new Color();
  const bits = (at, n, count, colour, speed) => {
    const home = root.parent || root;
    if (!fall || fall.im.parent !== home) {
      if (fall) { fall.im.removeFromParent(); fall.im.dispose(); }
      bitGeo ||= new BoxGeometry(.013, .005, .011); bitMat ||= pbr('#ffffff', { rough: .08, metal: .25 });
      const im = new InstancedMesh(bitGeo, bitMat, BIT_MAX); im.count = 0; im.instanceMatrix.setUsage(DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true;
      im.instanceColor = new InstancedBufferAttribute(new Float32Array(BIT_MAX * 3).fill(1), 3); im.name = 'glass bits'; home.add(im);
      fall = { im, home, p: new Float32Array(BIT_MAX * 3), v: new Float32Array(BIT_MAX * 3), r: new Float32Array(BIT_MAX * 3), w: new Float32Array(BIT_MAX * 3), still: new Uint8Array(BIT_MAX), n: 0, next: 0, ground: 0 };
    }
    root.updateMatrixWorld(true); home.updateMatrixWorld(true);
    fall.ground = home.worldToLocal(root.getWorldPosition(W)).y + .003;
    const wn = shell.localToWorld(Q.copy(at).add(n)).sub(shell.localToWorld(P.copy(at))).normalize(), out = home.worldToLocal(Q.copy(wn).add(home.getWorldPosition(W))).sub(home.worldToLocal(home.getWorldPosition(W))).normalize();
    const base = home.worldToLocal(shell.localToWorld(P.copy(at)));
    for (let k = 0; k < count; k++) {
      const i = fall.next; fall.next = (fall.next + 1) % BIT_MAX; fall.n = min(BIT_MAX, fall.n + 1); fall.still[i] = 0;
      const j = i * 3, s = (random() - .5) * .5, t = (random() - .5) * .5;
      fall.p[j] = base.x + s * (1 - abs(out.x)); fall.p[j + 1] = base.y + t * .6; fall.p[j + 2] = base.z + t * (1 - abs(out.z));
      const inward = random() < .7 ? -1 : 1;   // (most fall in, some out)
      fall.v[j] = out.x * inward * speed * random() + (random() - .5) * .8; fall.v[j + 1] = random() * .8; fall.v[j + 2] = out.z * inward * speed * random() + (random() - .5) * .8;
      for (let q = 0; q < 3; q++) { fall.r[j + q] = random() * 6.3; fall.w[j + q] = (random() - .5) * 30; }
      fall.im.setColorAt(i, CC.set(colour).multiplyScalar(.8 + random() * .3));
    }
    fall.im.count = fall.n; fall.im.instanceColor.needsUpdate = true;
    place();
  };
  const place = () => {
    for (let i = 0; i < fall.n; i++) { const j = i * 3; M4.compose(W.set(fall.p[j], fall.p[j + 1], fall.p[j + 2]), QQ.setFromEuler(EE.set(fall.r[j], fall.r[j + 1], fall.r[j + 2])), S1); fall.im.setMatrixAt(i, M4); }
    fall.im.instanceMatrix.needsUpdate = true;
  };
  /** Each frame (move() does it): the bits of broken glass fall and settle. */
  root.update = dt => {
    if (!fall || dt <= 0) return root;
    let busy = false;
    for (let i = 0; i < fall.n; i++) {
      if (fall.still[i]) continue; busy = true;
      const j = i * 3; fall.v[j + 1] -= 9.8 * dt;
      for (let q = 0; q < 3; q++) { fall.p[j + q] += fall.v[j + q] * dt; fall.r[j + q] += fall.w[j + q] * dt; }
      if (fall.p[j + 1] < fall.ground) {
        fall.p[j + 1] = fall.ground; fall.v[j + 1] *= -.22; fall.v[j] *= .5; fall.v[j + 2] *= .5; for (let q = 0; q < 3; q++) fall.w[j + q] *= .4;
        if (abs(fall.v[j + 1]) < .25) { fall.still[i] = 1; fall.r[j] = 0; fall.r[j + 2] = 0; }   // (lying flat)
      }
    }
    if (busy) place();
    return root;
  };
  return state;
}
