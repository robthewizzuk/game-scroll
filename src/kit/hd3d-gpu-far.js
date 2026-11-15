// The far world as a picture (v.farWorld, WebGPU): what is still and far off (the valley below a sniper's nest, hills,
// farms, a town across the river) is drawn into four pictures round the camera, one looking each way, and shown from
// them instead of being drawn again every frame; what is near, and anything far that moves, is drawn live as before.
//   - The pictures are kept a slice at a time: one of the four is drawn again every few frames (so the sun going
//     down, a cloud's shadow or a light coming on reaches them within half a second or so), not all four a frame.
//   - Each holds the depth of what it shows too. The picture is laid over the scene as a box round the camera whose
//     every pixel looks up its own direction: the point the four pictures hold there is found again from where the
//     camera is now (a few steps along the camera's own ray), so a camera a few metres from where a picture was drawn
//     still sees the far world in the right place, and each pixel goes into the scene's depth at that point's own
//     depth: near things cover it, fog, see-through things, the upscaler and frame generation treat it as the scene.
//   - Shown only while it holds up: the camera within a few metres of where the pictures were drawn (moving on, the
//     far world is drawn live and the pictures are drawn again where the camera settles), and no zooming in past the
//     pictures' own sharpness (a scope, binoculars: live again).
//   - What goes in: things at least `from` metres from the camera (all of their bounds), plain meshes and plain sets
//     of copies, opaque, not skinned, not twins the kit draws for them, and still. A thing that moves goes back to
//     being drawn live until it has kept still a while (userData.moves or userData.noFar keep a thing out; userData.hollow = r
//     says a mesh has nothing within r metres of its own middle, as gs.outdoors.horizon's ring).
//   - Shadows, reflections, occlusion culling and the shadow maps see the far things as before: they leave the
//     camera's own layer only for the scene's pass (as occlusion culling's hidden things do).
// Kit use only (hd3d.js decides when; WebGL draws everything live).
import { RenderTarget, HalfFloatType, LinearFilter, NearestFilter, DepthTexture, UnsignedShortType, PerspectiveCamera, Mesh, BoxGeometry, BackSide, NodeMaterial, Vector3, Matrix4, Box3, Color } from 'three/webgpu';
import { Fn, uniform, texture, vec2, vec4, float, If, Loop, Discard, positionWorld, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, normalize, dot, max, abs } from 'three/tsl';
import { eachShown } from './scene-list.js';

/** The layer the far things are on while their pictures are drawn (and instead of the camera's own during the scene's pass). */
export const FAR_LAYER = 23, FAR_BIT = 1 << FAR_LAYER;
// each picture is a little wider than a quarter turn, so a camera off its middle still finds every direction in one
const HALF = 48 * Math.PI / 180, TH = Math.tan(HALF), CH = Math.cos(HALF);
const LOOK = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];   // the pictures' directions; the box's sides in BoxGeometry's order: +x, -x, +y, -y, +z, -z
const SIDE = [1, 3, -1, -1, 2, 0];
const SCAN = 90, STILL = .03, MOVED = 240, DEG = Math.PI / 180;
const V = new Vector3(), V2 = new Vector3(), V3 = new Vector3(), B = new Box3();

const okMat = m => !!m && m.visible !== false && !m.transparent && m.depthWrite !== false && m.depthTest !== false && !(m.transmission > 0) && !m.alphaToCoverage;
function okThing(o, shBits) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh2 || o.isBatchedMesh || o.isDetailMesh || o.morphTargetInfluences || o.isLine || o.isPoints || o.isSprite) return false;
  const ud = o.userData; if (ud.moves || ud.noFar || ud.gsTwin || ud.gpuHid || ud.gsLod || ud.gsMoved !== undefined) return false;
  if ((o.layers.mask & ~shBits) !== 1 || !o.frustumCulled || o.renderOrder !== 0) return false;
  if (o.onBeforeRender !== Mesh.prototype.onBeforeRender) return false;
  if (o.isInstancedMesh && (!o.count || !o.instanceMatrix.count)) return false;
  const g = o.geometry; if (!g?.attributes?.position || g.isInstancedBufferGeometry) return false;
  const m = o.material; return Array.isArray(m) ? m.length > 0 && m.every(x => !x || okMat(x)) : okMat(m);
}
const worldBox = (o, out) => {
  if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); return out.copy(o.boundingBox).applyMatrix4(o.matrixWorld); }
  const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); return out.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
};
// a matrix as it stands in the scene's own numbers (the drawing's centre moving along, origin.js, is not the thing moving)
const sameAt = (o, rec, se) => { const e = o.matrixWorld.elements, m = rec.m; for (let i = 0; i < 16; i++) { const v = i >= 12 && i < 15 ? e[i] - se[i] : e[i]; if (Math.abs(v - m[i]) > 1e-5 * (1 + Math.abs(m[i]))) return false; } return !o.isInstancedMesh || (o.instanceMatrix.version === rec.iv && o.count === rec.n); };
const take = (o, rec, se) => { const e = o.matrixWorld.elements, m = rec.m; for (let i = 0; i < 16; i++) m[i] = i >= 12 && i < 15 ? e[i] - se[i] : e[i]; if (o.isInstancedMesh) { rec.iv = o.instanceMatrix.version; rec.n = o.count; } };

export class FarWorld {
  /** shBits: the view's shadow layer bits (they may ride along on a far thing); prep(material): what the view does to the box's materials (no ambient occlusion on them). */
  constructor(r, { shBits = 0, prep = null } = {}) {
    this.r = r; this.shBits = shBits; this.list = []; this.recs = new Map(); this.moved = new WeakMap(); this.gen = 0; this.frame = 0; this.scanAt = -1e9;
    // ON: whether the box shows the pictures this frame (it stays in the scene, so its shader is built ahead like anything new, hd3d.js holdNew)
    this.ON = uniform(0);
    this.cam = new PerspectiveCamera(); this.cam.layers.set(FAR_LAYER);
    this.band = null; this.W = 0; this.H = 0; this.on = false; this.ready = false; this.compiling = null; this.last = new Vector3(Infinity, 0, 0); this.still = 0;
    this.info = { things: 0, hidden: 0, on: false, why: 'starting', faces: 0, drawn: 0, w: 0, h: 0, mb: 0, redrawn: { new: 0, moved: 0, size: 0, turn: 0, place: 0 } };
    this.faces = LOOK.map((d, i) => {
      const U = { VP: uniform(new Matrix4()), IVP: uniform(new Matrix4()) };
      return { i, dir: new Vector3(...d), at: new Vector3(), gen: -1, age: 0, rt: null, U, col: texture(null), dep: texture(null), mat: null };
    });
    const none = new NodeMaterial(); none.visible = false;
    for (const f of this.faces) { f.mat = this.faceMaterial(f); prep?.(f.mat); }
    const mats = SIDE.map(k => k < 0 ? none : this.faces[k].mat);
    this.box = new Mesh(new BoxGeometry(2, 2, 2), mats); this.box.name = 'far world';
    this.box.frustumCulled = false; this.box.castShadow = this.box.receiveShadow = false; this.box.matrixAutoUpdate = false;
    Object.assign(this.box.userData, { noTrace: true, noBundle: true, noFar: true, noAO: true });
  }
  // each pixel of the box: the far point the pictures hold in its direction, found again from where the camera is now
  faceMaterial(f) {
    const m = new NodeMaterial(); m.name = 'Far world'; m.side = BackSide; m.fog = false; m.lights = false; m.toneMapped = false;
    const { VP, IVP } = f.U, col = f.col, dep = f.dep;
    const hit = Fn(() => {
      If(this.ON.lessThan(.5), () => { Discard(); });
      const d = normalize(positionWorld.sub(cameraPosition)).toVar(), P = cameraPosition.add(d.mul(1e5)).toVar(), q = vec2(0).toVar(), t = float(1e5).toVar();
      // one step: where P falls in the picture, and the point the picture holds there, brought onto the camera's own ray
      const step = () => {
        const c = VP.mul(vec4(P, 1)), n = c.xy.div(max(c.w, 1e-3));
        q.assign(vec2(n.x.mul(.5).add(.5), n.y.mul(-.5).add(.5)));
        const z = dep.sample(q).level(0).x, s = IVP.mul(vec4(n, z, 1)), at = s.xyz.div(s.w);
        t.assign(max(dot(at.sub(cameraPosition), d), 1)); P.assign(cameraPosition.add(d.mul(t)));
      };
      step();
      // (above or below every far thing: nothing more to look up)
      If(abs(q.y.sub(.5)).greaterThan(.52), () => { Discard(); });
      Loop(2, step);
      const k = col.sample(q).level(0);
      If(k.a.lessThan(.5).or(abs(q.x.sub(.5)).greaterThan(.5)).or(abs(q.y.sub(.5)).greaterThan(.5)), () => { Discard(); });
      return vec4(k.rgb.div(k.a), t);
    })().toVar('farHit');
    m.colorNode = vec4(hit.rgb, 1);
    // (a hair further than the point itself: where something drawn live is at the same place, it wins)
    m.depthNode = Fn(() => { const c = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(cameraPosition.add(normalize(positionWorld.sub(cameraPosition)).mul(hit.w.mul(1.003))), 1)); return c.z.div(c.w); })();
    return m;
  }
  /** Which things are far, and the band of heights they cover, seen from p (drawing numbers). */
  scan(scene, p, from, se) {
    const was = new Set(this.list), list = [], seen = new Set(), lights = this.lights = [];
    let lo = Infinity, hi = -Infinity, added = false;
    eachShown(scene, o => {
      if (o.isLight) { lights.push(o); return; }
      // (one that moved is drawn live until it has kept still a while, longer each time: a thing put in place as a level is built comes back)
      const mv = this.moved.get(o); if (mv && this.frame - mv.at < MOVED * 2 ** Math.min(6, mv.n - 1)) return;
      if (!okThing(o, this.shBits)) return;
      const b = worldBox(o, B);
      // nearest the box comes, and the furthest, across the ground; a hollow mesh (a ring of hills) from its inner edge
      const nx = Math.max(b.min.x - p.x, 0, p.x - b.max.x), nz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
      let dMin = Math.hypot(nx, nz);
      const fx = Math.max(Math.abs(b.min.x - p.x), Math.abs(b.max.x - p.x)), fz = Math.max(Math.abs(b.min.z - p.z), Math.abs(b.max.z - p.z)), dMax = Math.hypot(fx, fz);
      const hol = o.userData.hollow; if (hol > 0) { V.setFromMatrixPosition(o.matrixWorld); dMin = Math.max(dMin, hol - Math.hypot(V.x - p.x, V.z - p.z)); }
      const ny = Math.max(b.min.y - p.y, 0, p.y - b.max.y);
      // (one already in keeps its place until it is a tenth nearer: a camera wandering about the line doesn't swap it in and out)
      if (Math.hypot(dMin, ny) < (was.has(o) ? from * .9 : from) || dMin < 1) return;
      const y0 = b.min.y - p.y, y1 = b.max.y - p.y;
      lo = Math.min(lo, Math.atan2(y0, y0 < 0 ? dMin : dMax)); hi = Math.max(hi, Math.atan2(y1, y1 > 0 ? dMin : dMax));
      list.push(o); seen.add(o);
      if (!was.has(o)) added = true;
      let rec = this.recs.get(o); if (!rec) this.recs.set(o, rec = { m: new Float32Array(16), iv: 0, n: 0 }); take(o, rec, se);
    });
    for (const o of was) if (!seen.has(o)) { this.recs.delete(o); this.redo(); }
    this.list = list;
    if (!list.length) { this.band = null; return; }
    // (a few degrees more each way: the camera wanders a little from where the pictures were drawn)
    lo = Math.max(-70 * DEG, lo - 3 * DEG); hi = Math.min(70 * DEG, hi + 3 * DEG);
    const yb = lo < 0 ? Math.tan(lo) / CH : Math.tan(lo), yt = hi > 0 ? Math.tan(hi) / CH : Math.tan(hi);
    // (it grows with room to spare, and shrinks only to well under half: pictures are made again only now and then)
    const B0 = this.band;
    if (!B0 || yb < B0[0] - .005 || yt > B0[1] + .005 || yt - yb < (B0[1] - B0[0]) * .5) { const m = B0 ? .05 : 0; this.band = [yb - m, yt + m]; this.stale(true); this.info.redrawn.size++; }
    else if (added) { this.stale(); this.info.redrawn.new++; }
  }
  /** The pictures hold something now drawn live: each is drawn again next, in turn (the live one is in front of its copy meanwhile). */
  redo() { for (const f of this.faces) f.age += 1e4; }
  /** The pictures no longer hold what is far (true: and their size changes). */
  stale(size = false) { this.gen++; if (size) this.W = 0; }
  /** The pictures' size for a scene picture h pixels high seen through fov degrees (vertical), at most max wide. */
  size(h, fov, max) {
    const pr = h / 2 / Math.tan(fov * DEG / 2), [yb, yt] = this.band;
    const W = Math.min(max, Math.max(256, Math.ceil(2 * TH * pr / 128) * 128)), H = Math.max(16, Math.ceil(W * (yt - yb) / (2 * TH)));
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    for (const f of this.faces) {
      f.rt?.dispose();
      const rt = f.rt = new RenderTarget(W, H, { type: HalfFloatType, depthBuffer: true });
      rt.texture.minFilter = rt.texture.magFilter = LinearFilter; rt.texture.generateMipmaps = false; rt.texture.name = 'Far world ' + f.i;
      rt.depthTexture = new DepthTexture(W, H, UnsignedShortType); rt.depthTexture.minFilter = rt.depthTexture.magFilter = NearestFilter;
      rt.gsPart = 'far world';
      f.col.value = rt.texture; f.dep.value = rt.depthTexture; f.gen = -1;
    }
    this.info.w = W; this.info.h = H; this.info.mb = +(W * H * 10 * 4 / 1048576).toFixed(1);
  }
  // a face's camera at p (drawing numbers), looking its own way, cropped to the band
  aim(f, p, near, far) {
    const c = this.cam, [yb, yt] = this.band;
    c.position.copy(p); c.up.set(0, 1, 0); c.lookAt(V3.copy(p).add(f.dir)); c.near = near; c.far = far;
    c.updateProjectionMatrix = function () { this.projectionMatrix.makePerspective(-TH * this.near, TH * this.near, yt * this.near, yb * this.near, this.near, this.far, this.coordinateSystem, this.reversedDepth); this.projectionMatrixInverse.copy(this.projectionMatrix).invert(); };
    c.coordinateSystem = this.r.coordinateSystem; c._reversedDepth = !!this.r.reversedDepthBuffer;
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    return c;
  }
  // the far things (and the lights, which a camera gathers only from its own layers) on the far layer, for fn
  withFar(fn) {
    const L = this.list, lit = [];
    for (const o of L) o.layers.mask |= FAR_BIT;
    for (const l of this.lights || []) if (l.parent && !(l.layers.mask & FAR_BIT)) { l.layers.mask |= FAR_BIT; lit.push(l); }
    try { return fn(); } finally { for (const o of L) o.layers.mask &= ~FAR_BIT; for (const l of lit) l.layers.mask &= ~FAR_BIT; }
  }
  /**
   * Before the scene's pass. view: cam, scene; o: { from, slack, max, h (the scene picture's height), every }.
   * Returns whether the picture stands in for the far things this frame (they are then off the camera's layer until back()).
   */
  step(scene, cam, o) {
    const se = scene.matrixWorld.elements, p = cam.getWorldPosition(V), from = o.from;
    this.frame++;
    // the box round the camera, only as tall as the band the far things fill (each side is a picture's own plane, a box's half width
    // out: no pixel above or below them runs its shader), drawing nothing until the pictures stand in
    const bx = this.box, k = Math.max(1, cam.near * 4), [yb, yt] = this.band || [-1, 1];
    bx.matrix.makeTranslation(p.x - se[12], p.y - se[13] + k * (yb + yt) / 2, p.z - se[14]).scale(V2.set(k, k * ((yt - yb) / 2 + .05), k)); bx.matrixWorldNeedsUpdate = true; bx.updateMatrixWorld();
    if (this.frame - this.scanAt >= SCAN || !this.band) { this.scanAt = this.frame; this.scan(scene, p, from, se); }
    const info0 = this.info;
    // anything far that moved goes back to being drawn live (until it has kept still a while), and the pictures are drawn again without it
    if (this.list.length) {
      let k = 0;
      for (const t of this.list) { const rec = this.recs.get(t); if (t.parent && rec && sameAt(t, rec, se)) this.list[k++] = t; else { const mv = this.moved.get(t); this.moved.set(t, { at: this.frame, n: (mv?.n || 0) + 1 }); this.recs.delete(t); this.redo(); info0.redrawn.moved++; } }
      this.list.length = k;
    }
    const info = this.info; info.things = this.list.length;
    const off = why => { info.on = false; info.why = why; this.on = false; return false; };
    if (!this.list.length || !this.band) return off('nothing far');
    const fov = cam.getEffectiveFOV();
    if (!this.W && fov >= 30) this.size(o.h, fov, o.max);
    if (!this.W) return off('zoomed');
    // where the camera is in the scene's own numbers, and whether it has settled
    V2.set(p.x - se[12], p.y - se[13], p.z - se[14]);
    this.still = V2.distanceTo(this.last) < STILL * Math.max(1, from / 150) ? this.still + 1 : 0; this.last.copy(V2);
    const near = f => f.gen === this.gen && f.at.distanceTo(V2) < o.slack;
    let ok = 0; for (const f of this.faces) if (near(f)) ok++;
    info.faces = ok;
    // the face to draw this frame: one that doesn't hold up from here (once the camera has settled), else the oldest, every few frames
    this.due = null;
    if (ok < 4) { if (this.still >= 2) for (const f of this.faces) if (!near(f) && (!this.due || f.age > this.due.age)) this.due = f; if (this.due?.gen === this.gen) info.redrawn.place++; }
    else if (this.frame % Math.max(1, o.every | 0) === 0) { for (const f of this.faces) if (!this.due || f.age > this.due.age) this.due = f; info.redrawn.turn++; }
    for (const f of this.faces) f.age++;
    // sharper than the pictures (zoomed in): live
    const pr = o.h / 2 / Math.tan(fov * DEG / 2), fr = this.W / (2 * TH);
    if (pr > fr * 2) return off('zoomed');
    if (ok < 4) return off(this.due ? 'drawing' : 'moving');
    if (!this.ready) return off('building');
    if (!(this.box.layers.mask & 1) || !this.box.parent) return off('building');   // (the box's own shader: still being built, hd3d.js holdNew)
    // where each picture was drawn, in the drawing's numbers now
    for (const f of this.faces) { const c = this.aim(f, V.set(f.at.x + se[12], f.at.y + se[13], f.at.z + se[14]), f.near, f.far); f.U.VP.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse); f.U.IVP.value.copy(f.U.VP.value).invert(); }
    info.hidden = this.list.length; info.on = true; info.why = '';
    return this.on = true;
  }
  /** Just before the scene's pass (when step() said so): the far things off the camera's layer, the box showing the pictures. */
  hide(cam, shadowCams) {
    this.ON.value = 1;
    const hid = this.hid ||= [];
    for (const t of this.list) { const m = t.layers.mask; if (m & 1) { hid.push(t, m); t.layers.mask = (m & ~1) | FAR_BIT; } }
    // (a light's shadow camera with no layers of its own takes the camera's for the frame: the far things still cast)
    const sc = this.shc ||= [];
    for (const c of shadowCams || []) if ((c.layers.mask & ~1) === 0) { sc.push(c, c.layers.mask); c.layers.mask = cam.layers.mask | FAR_BIT; }
  }
  /** Straight after the scene's pass: everything back as it was. */
  back() {
    const hid = this.hid; if (hid?.length) { for (let i = 0; i < hid.length; i += 2) hid[i].layers.mask = hid[i + 1]; hid.length = 0; }
    const sc = this.shc; if (sc?.length) { for (let i = 0; i < sc.length; i += 2) sc[i].layers.mask = sc[i + 1]; sc.length = 0; }
    this.ON.value = 0;
  }
  /** Before the scene's pass: the face that is due, drawn where the camera is (for the frames after this one). */
  draw(scene, cam, o) {
    const f = this.due; this.due = null; if (!f || !f.rt) return false;
    const r = this.r, se = scene.matrixWorld.elements, p = cam.getWorldPosition(V2);
    f.near = Math.max(cam.near, o.from * .7); f.far = Math.max(f.near * 2, cam.far);
    const c = this.aim(f, p, f.near, f.far);
    const was = r.getRenderTarget(), cc = r.getClearColor(new Color()), ca = r.getClearAlpha(), bg = scene.background, mrt = r.getMRT();
    // (the shaders for these pictures, built in the background before the first is drawn)
    if (!this.ready) {
      if (!this.compiling) {
        // (three's queued builds put back the target they were made for once each is done, ours, which would leave every
        // frame after drawing into it: each is told to put back what was there before, as hd3d.js forPass does)
        const make = r._createObjectPipeline, own = typeof make === 'function';
        if (own) r._createObjectPipeline = function (...a) {
          const list = this._compilationPromises, n = list ? list.length : 0; make.apply(this, a);
          if (list) for (let i = n; i < list.length; i++) { const st = list[i].precompilationState; if (st) { st.outputRenderTarget = was; st.outputMRT = mrt; } }
        };
        r.setRenderTarget(f.rt); r.setMRT(null); scene.background = null;
        try { this.compiling = this.withFar(() => r.compileAsync(scene, c)) || Promise.resolve(); }
        catch (e) { this.compiling = Promise.resolve(); }
        finally { if (own) delete r._createObjectPipeline; scene.background = bg; r.setRenderTarget(was); r.setMRT(mrt); }
        this.compiling.then(() => { this.ready = true; }, () => { this.ready = true; });
      }
      return false;
    }
    r.setRenderTarget(f.rt); r.setMRT(null); r.setClearColor(0x000000, 0); scene.background = null;
    try { this.withFar(() => r.render(scene, c)); }
    finally { scene.background = bg; r.setClearColor(cc, ca); r.setRenderTarget(was); r.setMRT(mrt); }
    f.at.set(p.x - se[12], p.y - se[13], p.z - se[14]); f.gen = this.gen; f.age = 0; this.info.drawn++;
    return true;
  }
  dispose() { this.back(); this.box.removeFromParent(); this.box.geometry.dispose(); for (const f of this.faces) { f.rt?.dispose(); f.mat.dispose(); } this.list.length = 0; }
}
