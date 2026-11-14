// Finer sun shadows on WebGPU (sunmask.js has the bookkeeping; hd3d.js decides when). One small pass a frame, after
// the scene is drawn, works out from that frame's depth picture what the sun's shadow maps miss, into a picture at
// half size (the sun mask): red, how much of the sun gets through; green, how far away the surface was. The next
// frame's materials read it through the camera that drew it (the sun's light, hd3d-gpu.js gpuSunLight, is multiplied
// by it), so no pass waits for another: a surface still on screen finds itself (the distance says it is the same
// surface), one that just came into view gets the sun as the maps give it. Three things go into it:
//   contact: a short ray towards the sun through the depth picture (the cup on a table, a hand on a cup, a nose on a
//     cheek, a collar on a neck): shadows smaller than a texel of the sun's map;
//   far: past the sun's own shadow box, a ray towards the sun over a map of heights round the camera (the top of every
//     shadow caster, drawn from above a tile a frame): hills and buildings shade the land far off;
//   capsules: crowd members too far off to draw into the sun's map each throw a capsule's soft shadow, so a crowd
//     walking across a square doesn't have the sun's map drawn again every frame.
// Kit use only.
import { RenderTarget, HalfFloatType, FloatType, RGFormat, RedFormat, RGBAFormat, NearestFilter, DataTexture, NodeMaterial, QuadMesh, Mesh, PlaneGeometry, OrthographicCamera, Matrix4, Vector2, Vector3, Vector4, RendererUtils, DoubleSide, AlwaysDepth, NoBlending } from 'three/webgpu';
import { Fn, Loop, If, Break, float, int, vec2, vec4, ivec2, uniform, renderGroup, texture, uv, positionWorld, positionGeometry, select, smoothstep, clamp, min, max, abs, dot, length, mix, fract, floor, pow, getViewPosition, interleavedGradientNoise, screenCoordinate, dFdx, dFdy } from 'three/tsl';
import { CAPS, GRID, HeightTiles } from './sunmask.js';
import { ORIGIN } from './origin.js';

const NOTHING_V = -10000;
const STEPS = 12, FAR_STEPS = 24, MS = 768;   // (the mask's picture is MS x MS, the mask drawn into a corner of it: see MASK)
// (every number here is read per render: three sends a thing's own numbers again only when it or its material changes)
const U = {
  on: uniform(0), VP: uniform(new Matrix4()), maskK: uniform(new Vector2(1, 1)),   // what materials read: whether the mask is this view's, the camera that drew it, the corner of the picture it fills
  invProj: uniform(new Matrix4()), proj: uniform(new Matrix4()), camWorld: uniform(new Matrix4()),
  sunV: uniform(new Vector3(0, 1, 0)), sunW: uniform(new Vector3(0, 1, 0)),   // the way to the sun, in the camera's view and in the world
  contact: uniform(new Vector4()),                                   // on, ray length (m), thickness (m), out to (m)
  far: uniform(new Vector4()), farB: uniform(new Vector4()),         // on, the map's size (m), its middle x, z; bias (m), first step (m), steps' growth
  box: uniform(new Matrix4()), boxOn: uniform(0),                    // the sun's own shadow map (inside it the far part is left out)
  caps: uniform(new Vector4()),                                      // how many capsules, the grid's corner x, z, a square's size
  rawPx: uniform(new Vector2(1, 1)),                                 // a texel of the raw mask, in its uv
};
for (const u of Object.values(U)) u.setGroup(renderGroup);

// the mask: one picture for good, of one size, the mask drawn into its corner at about half the frame's size (no bigger than
// the picture). A material that hasn't changed keeps the picture it was first given, so one made bigger or smaller (which
// three makes anew) would leave every unchanged thing reading a picture that is gone.
const MASK = { rt: new RenderTarget(MS, MS, { type: HalfFloatType, format: RGFormat, depthBuffer: false }), owner: null, depth: null, rev: null, mat: null, quad: new QuadMesh(), ms: 0, frames: 0,
  // (the mask as worked out, before it is smoothed into rt: its own size, read only by the smoothing)
  raw: new RenderTarget(1, 1, { type: HalfFloatType, format: RGFormat, depthBuffer: false }), smooth: null };
MASK.raw.texture.name = 'sun mask (raw)';
MASK.rt.gsPart = MASK.raw.gsPart = 'sun mask';   // (the chip's time for these passes comes back under this name: hd3d.js steps the mask's size down by it)
MASK.rt.texture.name = 'sun mask';
const maskTex = MASK.rt.texture;
// the capsules (two texels each) and the grid of which reach each square (two texels a square)
const capT = new DataTexture(new Float32Array(CAPS * 8), CAPS * 2, 1, RGBAFormat, FloatType), gridT = new DataTexture(new Float32Array(GRID * GRID * 8), GRID * 2, GRID, RGBAFormat, FloatType);
for (const t of [capT, gridT]) { t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
capT.name = 'sun mask capsules'; gridT.name = 'sun mask capsule grid';
// the map of heights (red: the height of the top of what's there; very low where nothing is)
// (made when a view first wants far shadows, let go when none does: the mask's own material is made again for it)
const HT = { at: new Vector3(), rt: null, tiles: null, cam: new OrthographicCamera(), mat: null, wipe: null, rev: null, drawn: 0, none: new DataTexture(new Float32Array([NOTHING_V, 0, 0, 0]), 1, 1, RGBAFormat, FloatType) };
HT.none.needsUpdate = true;
const NOTHING = NOTHING_V;
let state;   // (the renderer's state while a pass of ours draws)

/** How much of the sun reaches this point, by the mask (1 where the mask has nothing to say). For the sun's light. */
export function sunMaskAt() {
  return Fn(() => {
    const c = U.VP.mul(vec4(positionWorld, 1)), w = max(c.w, 1e-4), n = c.xy.div(w), q = vec2(n.x.mul(.5).add(.5), n.y.mul(-.5).add(.5));
    const m = texture(maskTex, clamp(q.mul(U.maskK), .5 / MS, U.maskK.sub(.5 / MS)));
    const inside = q.x.greaterThan(0).and(q.x.lessThan(1)).and(q.y.greaterThan(0)).and(q.y.lessThan(1));
    const same = abs(m.y.sub(w)).lessThan(w.mul(.03).add(.06));
    return select(U.on.greaterThan(.5).and(inside).and(same), m.x, float(1));
  })();
}

// how dark a capsule makes a point (as sunmask.js capsuleShade)
const capShade = (P, L, A, B) => {
  const r = A.w, D = B.xyz.sub(A.xyz), C = max(dot(D, D), 1e-8), w = P.sub(A.xyz), b = dot(L, D), dd = dot(L, w), e = dot(D, w);
  const own = length(w.sub(D.mul(clamp(e.div(C), 0, 1))));
  const s1 = clamp(e.sub(b.mul(dd)).div(max(C.sub(b.mul(b)), 1e-6)), 0, 1), t = max(0, b.mul(s1).sub(dd)), s = clamp(e.add(b.mul(t)).div(C), 0, 1);
  const d = length(w.add(L.mul(t)).sub(D.mul(s))), pen = r.mul(.3).add(t.mul(.035));
  return select(own.lessThan(r.mul(1.2)), float(0), smoothstep(r.sub(pen.mul(.5)), r.add(pen), d).oneMinus());
};

function maskMaterial(depthTex, rev) {
  const m = new NodeMaterial(); m.name = 'Sun mask';
  const dT = texture(depthTex), hT = texture(HT.rt ? HT.rt.texture : HT.none), cT = texture(capT), gT = texture(gridT);
  const depthAt = q => dT.sample(q).x;
  m.fragmentNode = Fn(() => {
    const q = uv(), d = depthAt(q).toVar(), out = vec4(1, 60000, 0, 1).toVar();
    // (how far the surface's depth changes from one of the mask's pixels to the next: ground seen at a slant, far off,
    // changes by a lot, and a ray's step lands on a neighbouring pixel's depth, which must not count as something in
    // front. Worked out here, before any branch, as the graphics chip's screen differences need)
    const P = getViewPosition(q, d, U.invProj).toVar(), fz = min(max(abs(dFdx(P.z)), abs(dFdy(P.z))), 2).toVar();
    If((rev ? d.greaterThan(0) : d.lessThan(1)), () => {
      const dist = P.z.negate().toVar(), vis = float(1).toVar();
      // contact: a few steps towards the sun through the depth picture; a surface in front of the ray (and not too far in front) shades it
      If(U.contact.x.greaterThan(.5).and(dist.lessThan(U.contact.w)), () => {
        const len = U.contact.y, jit = interleavedGradientNoise(screenCoordinate), occ = float(0).toVar();
        Loop(STEPS, ({ i }) => {
          const t = float(i).add(jit).add(.3).div(STEPS).mul(len), Q = P.add(U.sunV.mul(t));
          const c = U.proj.mul(vec4(Q, 1)), n = c.xy.div(c.w), qq = vec2(n.x.mul(.5).add(.5), n.y.mul(-.5).add(.5));
          If(qq.x.lessThan(0).or(qq.x.greaterThan(1)).or(qq.y.lessThan(0)).or(qq.y.greaterThan(1)), () => { Break(); });
          const S = getViewPosition(qq, depthAt(qq), U.invProj), gap = S.z.sub(Q.z), qd = Q.z.negate();
          const slack = qd.mul(.004).add(.006).add(fz.mul(2));
          If(gap.greaterThan(slack).and(gap.lessThan(U.contact.z.add(qd.mul(.01)).add(slack))), () => { occ.assign(float(1).sub(t.div(len).mul(.5))); Break(); });
        });
        vis.mulAssign(float(1).sub(occ.mul(smoothstep(U.contact.w.mul(.7), U.contact.w, dist).oneMinus())));
      });
      const W = U.camWorld.mul(vec4(P, 1)).xyz.toVar(), L = U.sunW;
      // far: outside the sun's own shadow box, a ray towards the sun over the map of heights
      If(U.far.x.greaterThan(.5), () => {
        const sc = U.box.mul(vec4(W, 1)), e = min(sc.xy, sc.xy.oneMinus()), inBox = U.boxOn.mul(smoothstep(0, .06, min(e.x, e.y)));
        If(inBox.lessThan(.999), () => {
          // (the steps grow as they go, so far out one can step over a tower: each pixel starts at its own point between
          // two steps, and the smoothing pass after evens the grain into a softer edge)
          const size = U.far.y, hv = float(1).toVar(), fj = interleavedGradientNoise(screenCoordinate.add(vec2(17, 5)));
          Loop(FAR_STEPS, ({ i }) => {
            const t = U.farB.y.mul(pow(U.farB.z, float(i).add(fj))), Q = W.add(L.mul(t));
            If(abs(Q.x.sub(U.far.z)).greaterThan(size.mul(.5)).or(abs(Q.z.sub(U.far.w)).greaterThan(size.mul(.5))), () => { Break(); });
            const h = hT.sample(fract(Q.xz.div(size))).x, pen = t.mul(.02).add(.3);
            hv.assign(min(hv, smoothstep(pen.negate(), pen, Q.y.sub(h).add(U.farB.x).add(t.mul(.004)))));
            If(hv.lessThan(.02), () => { Break(); });
          });
          vis.mulAssign(mix(hv, float(1), inBox));
        });
      });
      // capsules: the ones whose shadows fall across this point's square of the grid
      If(U.caps.x.greaterThan(0), () => {
        const g = W.xz.sub(U.caps.yz).div(U.caps.w);
        If(g.x.greaterThanEqual(0).and(g.y.greaterThanEqual(0)).and(g.x.lessThan(GRID)).and(g.y.lessThan(GRID)), () => {
          const gi = ivec2(floor(g)), a = gT.load(ivec2(gi.x.mul(2), gi.y)), b = gT.load(ivec2(gi.x.mul(2).add(1), gi.y)), cv = float(1).toVar();
          for (const k of [a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w]) {
            If(k.greaterThan(.5), () => {
              const j = int(k).sub(1).mul(2);
              cv.mulAssign(float(1).sub(capShade(W, L, cT.load(ivec2(j, 0)), cT.load(ivec2(j.add(1), 0))).mul(.8)));
            });
          }
          vis.mulAssign(cv);
        });
      });
      out.assign(vec4(vis, dist, 0, 1));
    });
    return out;
  })();
  return m;
}

// The mask smoothed: a 3 x 3 tent over the raw mask, each neighbour by how near its surface is to this one's (so a shadow
// doesn't bleed across an edge onto something further back): softer edges, and the dither of the rays' starts gone.
function smoothMaterial() {
  const m = new NodeMaterial(); m.name = 'Sun mask smoothing';
  const R = texture(MASK.raw.texture), px = U.rawPx;
  m.fragmentNode = Fn(() => {
    const q = uv(), c = R.sample(q), sum = float(0).toVar(), wt = float(0).toVar();
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const k = (2 - Math.abs(x)) * (2 - Math.abs(y)), n = x || y ? R.sample(q.add(px.mul(vec2(x, y)))) : c;
      const w = float(k).mul(x || y ? smoothstep(0, c.y.mul(.04).add(.05), abs(n.y.sub(c.y))).oneMinus() : float(1));
      sum.addAssign(n.x.mul(w)); wt.addAssign(w);
    }
    return vec4(sum.div(max(wt, 1e-4)), c.y, 0, 1);
  })();
  return m;
}

/**
 * Draws this frame's mask from its depth picture (after the scene's pass: hd3d-gpu.js realFrame). o: { owner (the
 * view), contact: { length, thickness, out } or null, far: whether the map of heights is in use, L (the way to the
 * sun), box (the sun's shadow matrix) or null, caps: binned capsules (sunCaps) or null }.
 */
export function sunMask(r, depthTex, cam, o) {
  if (!depthTex?.image) return;
  const t0 = performance.now(), rev = !!r.reversedDepthBuffer, W = depthTex.image.width, H = depthTex.image.height, k = Math.min(.5 * (o.k || 1), MS / W, MS / H);
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k)); U.maskK.value.set(w / MS, h / MS);
  if (MASK.depth !== depthTex || MASK.rev !== rev || MASK.ht !== HT.rt) { MASK.mat?.dispose(); MASK.mat = maskMaterial(depthTex, rev); MASK.depth = depthTex; MASK.rev = rev; MASK.ht = HT.rt; }
  cam.updateMatrixWorld();
  U.invProj.value.copy(cam.projectionMatrixInverse); U.proj.value.copy(cam.projectionMatrix); U.camWorld.value.copy(cam.matrixWorld);
  U.sunW.value.copy(o.L); U.sunV.value.copy(o.L).transformDirection(cam.matrixWorldInverse);
  const c = o.contact; U.contact.value.set(c ? 1 : 0, c?.length ?? .3, c?.thickness ?? .25, c?.out ?? 40);
  if (o.far && HT.tiles) { const [mx, mz] = HT.tiles.mid, T = HT.tiles; U.far.value.set(1, T.size, mx, mz); U.farB.value.set(.8, T.tile / T.tpx * 1.5, Math.pow(Math.max(2, o.farReach || T.size * .5) / (T.tile / T.tpx * 1.5), 1 / (FAR_STEPS - 1)), 0); }
  else U.far.value.x = 0;
  U.boxOn.value = o.box ? 1 : 0; if (o.box) U.box.value.copy(o.box);
  const cp = o.caps; U.caps.value.set(cp?.n || 0, cp?.x0 || 0, cp?.z0 || 0, cp?.cell || 1);
  state = RendererUtils.resetRendererState(r, state);
  try {
    if (MASK.raw.width !== w || MASK.raw.height !== h) MASK.raw.setSize(w, h);
    U.rawPx.value.set(1 / w, 1 / h);
    MASK.quad.material = MASK.mat; MASK.quad.name = 'Sun mask';
    r.setRenderTarget(MASK.raw); MASK.quad.render(r);
    const rt = MASK.rt; rt.viewport.set(0, 0, w, h); rt.scissor.set(0, 0, w, h); rt.scissorTest = true;
    MASK.quad.material = MASK.smooth ||= smoothMaterial(); MASK.quad.name = 'Sun mask smoothing';
    r.setRenderTarget(rt); MASK.quad.render(r);
  } finally { const rt = MASK.rt; rt.viewport.set(0, 0, MS, MS); rt.scissor.set(0, 0, MS, MS); rt.scissorTest = false; RendererUtils.restoreRendererState(r, state); }
  U.VP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); MASK.owner = o.owner;
  MASK.ms += performance.now() - t0; MASK.frames++;
}
/** Whether materials read the mask this frame (it is this view's, from its last frame). */
export function sunMaskOn(on) { U.on.value = on ? 1 : 0; }
export const sunMaskOwner = () => MASK.owner;
/** The capsules for the next mask (sunmask.js binCapsules has filled the two lists). */
export function sunCaps() { capT.needsUpdate = true; gridT.needsUpdate = true; return { caps: capT.image.data, grid: gridT.image.data }; }
/** The CPU's time for the mask's passes since the last call, and how many. */
export function sunMaskInfo() { const r = { ms: MASK.ms, frames: MASK.frames, tiles: HT.drawn }; MASK.ms = 0; MASK.frames = 0; HT.drawn = 0; return r; }

/* ---------- the map of heights ---------- */
function heightMaterials(rev) {
  if (HT.rev === rev) return;
  HT.rev = rev;
  // (each thing's own positionNode is kept: three hands it over to a material put over the scene)
  const m = HT.mat = new NodeMaterial(); m.name = 'Sun mask heights'; m.colorNode = vec4(positionWorld.y, 0, 0, 1); m.blending = NoBlending; m.side = DoubleSide;   // (no blending: a see-through thing hands over its transparent, and the picture has no alpha)
  m.forceSinglePass = true; m.fog = false; m.lights = false;
  const w = new NodeMaterial(); w.name = 'Sun mask heights wipe'; w.vertexNode = vec4(positionGeometry.xy, 0, 1); w.fragmentNode = vec4(NOTHING, 0, 0, 1); w.depthNode = float(rev ? 0 : 1);
  w.depthTest = true; w.depthFunc = AlwaysDepth; w.depthWrite = true; w.fog = false; w.lights = false;
  HT.wipe = new Mesh(new PlaneGeometry(2, 2), w); HT.wipe.frustumCulled = false;
}
const ORTHO = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
function inTile(r, s, go) {
  const rt = HT.rt, p = HT.tiles.tpx;
  r.setRenderTarget(rt); rt.viewport.set(s.sx, s.sy, p, p); rt.scissor.set(s.sx, s.sy, p, p); rt.scissorTest = true;
  try { go(); } finally { rt.viewport.set(0, 0, rt.width, rt.height); rt.scissor.set(0, 0, rt.width, rt.height); rt.scissorTest = false; }
}
/**
 * The map of heights round the camera at (x, y, z), a tile drawn a frame (tiles that came in are wiped at once, so
 * they shade nothing until drawn). o: { size (m), px (texels a side), tiles (a side), above (m over the camera the
 * top of the map is), depth (m it reaches down) }. mask: the camera's layers.
 */
export function farTiles(r, scene, x, y, z, mask, o = {}) {
  const size = o.size || 768, px = o.px || 512, n = o.tiles || 4, rev = !!r.reversedDepthBuffer;
  if (!HT.tiles || HT.tiles.size !== size || HT.tiles.px !== px || HT.tiles.tiles !== n) {
    HT.tiles = new HeightTiles(size, px, n);
    if (HT.rt?.width !== px) { HT.rt?.dispose(); HT.rt = new RenderTarget(px, px, { type: HalfFloatType, format: RedFormat, depthBuffer: true }); HT.rt.texture.name = 'sun mask heights'; HT.rt.gsPart = 'sun mask'; }
  }
  heightMaterials(rev);
  // (the tiles are kept by where they are in the drawing's space: when the drawing's centre moves, every one is drawn again)
  if (!HT.at.equals(ORIGIN)) { HT.tiles.reset(); HT.at.copy(ORIGIN); }
  const T = HT.tiles, came = T.at(x, z), top = y + (o.above ?? 400), deep = o.depth ?? 1200;
  state = RendererUtils.resetRendererAndSceneState(r, scene, state);
  r.autoClear = false;
  const name = scene.name;
  try {
    for (const s of came) inTile(r, s, () => r.render(HT.wipe, ORTHO));
    const s = T.next(); if (!s) return;
    const C = HT.cam, half = T.tile / 2; C.left = -half; C.right = half; C.top = half; C.bottom = -half; C.near = 0; C.far = deep;
    C.up.set(0, 0, -1); C.position.set((s.x0 + s.x1) / 2, top, (s.z0 + s.z1) / 2); C.lookAt(C.position.x, top - 1, C.position.z); C.updateProjectionMatrix(); C.updateMatrixWorld(true);
    C.layers.mask = mask;
    const fn = (object, sc, camera, geometry, material, group, lightsNode, clippingContext, passId) => { if (object.castShadow === true) r.renderObject(object, sc, camera, geometry, material, group, lightsNode, clippingContext, passId); };
    inTile(r, s, () => {
      r.render(HT.wipe, ORTHO);
      scene.overrideMaterial = HT.mat; r.setRenderObjectFunction(fn); scene.name = 'Sun mask heights';
      const go = () => r.render(scene, C);
      if (r.lighting?.shadowDraw) r.lighting.shadowDraw(scene, go); else go();
    });
    HT.drawn++;
  } finally { scene.name = name; RendererUtils.restoreRendererAndSceneState(r, scene, state); }
}
/** Lets the map of heights go (a view that no longer wants far shadows). */
export function farTilesOff() { HT.tiles = null; HT.rt?.dispose(); HT.rt = null; }
export const farTilesInfo = () => HT.tiles;
