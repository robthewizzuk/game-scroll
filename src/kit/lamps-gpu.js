// Night lights on WebGPU (lamps.js has the pool and says why): three's clustered lights (Forward+) with, for each lamp,
// a shadow from a slot of one shared depth picture (the atlas), a light shape worked out in the shader, and tube and
// sign lights that shine from the nearest part of themselves. Kit use only (hd3d-gpu.js).
//
// What each lamp needs beyond three's own four rows of numbers goes in eight more rows of the same lights picture
// (a shader may read only 16 pictures, and a lit material already reads many): row 4 its slot, shape, kind and reach;
// 5 to 8 the matrix from the camera's view to its slot's (or its shape's) picture; 9 and 10 a tube's or sign's edges;
// 11 its shadow's texel size and the square of a sign's own picture (decals-gpu.js's atlas: a sign that lights with its picture).
// The loop over a pixel's lamps is three's own (ClusteredLightsNode.setupLights) with those added.
// Decals share the list and the grid, after the lamps (decals-gpu.js): a pixel lays its decals on before any light.
import { DataTexture, FloatType, RGBAFormat, RenderTarget, DepthTexture, LessEqualCompare, GreaterEqualCompare, LinearFilter, NodeMaterial, NoBlending, LightsNode, LightingNode, Matrix4, Vector4, RendererUtils, Mesh, PlaneGeometry, OrthographicCamera, AlwaysDepth } from 'three/webgpu';
import { Fn, Loop, If, Break, int, float, positionGeometry, vec2, vec3, vec4, ivec2, textureLoad, texture, uniform, positionView, normalView, normalViewGeometry, smoothstep, dot, clamp, max, min, mix, normalize, cross, directPointLight, select, roughness, abs, reflect, fract, floor, sin, exp, length, atan, step, sqrt, log2, getDistanceAttenuation, clearcoatRoughness, renderGroup } from 'three/tsl';
import ClusteredLightsNode from 'three/examples/jsm/tsl/lighting/ClusteredLightsNode.js';
import { writeDecals, decalPass, pictureAt, PX as PIC_PX } from './decals-gpu.js';

const ROW0 = 4, ROWS = 12;   // (three's rows are 0..3)
const VM = new Matrix4();
// one depth picture for every view's lamp shadows (the atlas), a single texel until a lamp has a shadow
// (one picture for good, made bigger or smaller in place, the atlas's own from the start: made first for a material on
// its own, then given to the atlas, three would make it again by its version, which still things never see)
const ATLAS = { rt: new RenderTarget(1, 1, { depthBuffer: true }), cols: 4, rows: 0, px: 512, gen: 0, ready: false };
const DEPTH = new DepthTexture(1, 1); DEPTH.compareFunction = LessEqualCompare; DEPTH.minFilter = DEPTH.magFilter = LinearFilter; DEPTH.name = 'lamp shadows';
ATLAS.rt.depthTexture = DEPTH;
const atlasTex = texture(DEPTH);
// A stand-in among each lamp-lit material's lights that carries the atlas's size. three looks again at what a thing
// drawn is bound to only when the thing, its material or its lights change, a shadow map made at a new size among them
// (which is how three's own shadow maps are bound again); so the atlas made at a new size is that change for every
// lamp-lit thing, still ones too, which would otherwise go on drawing with the picture three threw away (a frame the
// chip refuses). Built into a material, it adds nothing to the light.
class AtlasMark extends LightingNode { constructor() { super(); this.castShadow = true; this.shadow = { mapSize: { width: 1, height: 1 } }; } setup() {} }
const MARK = new AtlasMark();
const marked = () => { MARK.shadow.mapSize.width = ATLAS.rt.width; MARK.shadow.mapSize.height = ATLAS.rt.height; };
const ATLAS_U = uniform(new Vector4(4, 1, 512, 0)).setGroup(renderGroup);   // cols, rows, slot texels, depth bias (read per render, as above)
let reversed = false;

/* ---------- the shapes, as lamps.js shapeAt ---------- */
const sm = (a, b, x) => smoothstep(a, b, x);
const hash = (x, y) => fract(sin(x.mul(127.1).add(y.mul(311.7))).mul(43758.5453));
const vnoise = (x, y) => {
  const i = floor(x), j = floor(y), u = sm(0, 1, x.sub(i)), w = sm(0, 1, y.sub(j));
  return mix(mix(hash(i, j), hash(i.add(1), j), u), mix(hash(i, j.add(1)), hash(i.add(1), j.add(1)), u), w);
};
const PANES = [[.88, .27, .23], [.23, .44, .88], [.94, .75, .25], [.25, .75, .42], [.75, .38, .82], [.94, .54, .19]];
function shapeNode(i, u, v) {
  const box = (a, b) => sm(a - .01, a + .01, u).mul(sm(a - .01, a + .01, v)).mul(sm(b - .01, b + .01, u).oneMinus()).mul(sm(b - .01, b + .01, v).oneMinus());
  const line = (x, w) => sm(w - .008, w + .008, abs(x));
  const k0 = (() => {
    const v0 = float(.5).sub(sm(.5, .72, u).mul(.1)), under = sm(v0.sub(.012), v0.add(.012), v), side = sm(0, .22, u).mul(sm(.78, 1, u).oneMinus());
    const hot = exp(u.sub(.56).pow(2).mul(9).add(v.sub(v0).sub(.07).pow(2).mul(60)).negate());
    return under.mul(sm(v0, 1, v).mul(.6).oneMinus()).add(hot.mul(.9)).add(sm(v0.sub(.14), v0, v).mul(.05)).mul(side);
  })();
  const k1 = box(.1, .9).mul(line(u.sub(.5), .03)).mul(line(v.sub(.5), .03));
  const k2 = box(.08, .92).mul(sm(.5, .56, fract(v.mul(12))));
  const x = u.sub(.5), y = v.sub(.5), r = length(vec2(x, y)), a = atan(y, x), sp = abs(fract(a.div(Math.PI / 3).add(.5)).sub(.5)).mul(r).mul(Math.PI / 3);
  const k3 = line(r.sub(.22), .018).mul(line(r.sub(.4), .018)).mul(select(r.lessThan(.08), float(1), sm(.012, .028, sp)));
  const k4 = sm(.48, .62, vnoise(u.mul(7), v.mul(7)).mul(.6).add(vnoise(u.mul(15).add(3), v.mul(15)).mul(.4))).mul(.88).add(.12);
  const g = (t) => sm(.12, .18, fract(t.mul(6))).mul(sm(.82, .88, fract(t.mul(6))).oneMinus());
  const k5 = g(u).mul(g(v));
  const fu = fract(u.sub(.1).div(.16)), fv = fract(v.sub(.1).div(.16));
  const k6 = box(.1, .9).mul(sm(.04, .1, fu)).mul(sm(.9, .96, fu).oneMinus()).mul(sm(.04, .1, fv)).mul(sm(.9, .96, fv).oneMinus());
  const pane = floor(hash(floor(u.sub(.1).div(.16)).add(7), floor(v.sub(.1).div(.16)).add(3)).mul(6));
  let col6 = vec3(...PANES[5]);
  for (let p = 4; p >= 0; p--) col6 = select(pane.lessThan(p + .5), vec3(...PANES[p]), col6);
  const k7 = box(.1, .9).mul(sm(.12, .2, fract(u.sub(.1).mul(7.5)))).mul(line(v.sub(.3), .015));
  const ks = [k0, k1, k2, k3, k4, k5, null, k7];
  let out = vec3(1);
  for (let s = 7; s >= 0; s--) out = select(i.lessThan(s + .5), s === 6 ? col6.mul(k6) : vec3(ks[s]), out);
  return out;
}

/**
 * three's clustered lights with the kit's lamps (lamps.js). Also keeps the face light (HDView.faceLight) out of the
 * clusters: a material lights it as its own light.
 */
export class KitLampsNode extends ClusteredLightsNode {
  constructor(...a) {
    super(...a);
    // eight more rows in three's own picture of the lights (see above)
    this._lightsTexture = new DataTexture(new Float32Array(this.maxLights * 4 * ROWS), this.maxLights, ROWS, RGBAFormat, FloatType);
    // The grid's size is read per render, as its camera is: three keeps it with each thing drawn, which three sends
    // again only when that thing or its material changes, so a scene first drawn at another size (the loading screen's
    // build, a card's picture) went on reading the old grid, and lamps dropped out of squares of the screen
    this._gridDimensions.setGroup(renderGroup);
    // where the decals start in the list (after the lamps), and how many (decals-gpu.js)
    this.gsLampN = uniform(0, 'int').setGroup(renderGroup); this.gsDecalN = uniform(0, 'int').setGroup(renderGroup);
  }
  _isClusteredLight(l) { return !l.userData.gsFill && super._isClusteredLight(l); }
  getBuiltinLights() { const a = this._gsBuiltin ||= []; a.length = 0; a.push(...super.getBuiltinLights(), MARK); return a; }   // (and the atlas's stand-in, above)
  _updateLightsTexture(camera) {
    super._updateLightsTexture(camera);
    const tex = this._lightsTexture, data = tex.image.data, line = tex.image.width * 4, order = this._lightSortOrder, n = order.length;
    let any = false;
    for (let i = 0; i < n; i++) {
      const l = this.clusteredLights[order[i]], L = l.userData.gsLamp, o = i * 4;
      let r = line * ROW0 + o;
      if (!L || !(L.slot >= 0 || L.proj || L.kind)) { data[r] = -1; data[r + 1] = -1; data[r + 2] = 0; data[r + 3] = 0; continue; }
      any = true;
      data[r] = L.slot; data[r + 1] = L.proj ? L.shape : -1; data[r + 2] = L.kind; data[r + 3] = L.reach;
      if (L.proj) {
        // the camera's view -> the slot's picture: world -> picture (lamps.js) after view -> world
        VM.multiplyMatrices(L.m, camera.matrixWorld); const e = VM.elements;
        for (let row = 0; row < 4; row++) { r = line * (ROW0 + 1 + row) + o; data[r] = e[row]; data[r + 1] = e[4 + row]; data[r + 2] = e[8 + row]; data[r + 3] = e[12 + row]; }
      }
      if (L.kind) {
        r = line * (ROW0 + 5) + o; data[r] = L.a.x; data[r + 1] = L.a.y; data[r + 2] = L.a.z; data[r + 3] = L.ha;
        r = line * (ROW0 + 6) + o; data[r] = L.b.x; data[r + 1] = L.b.y; data[r + 2] = L.b.z; data[r + 3] = L.hb;
      }
      r = line * (ROW0 + 7) + o; data[r] = L.texel || 0; data[r + 1] = L.kind === 2 && L.cell >= 0 ? L.cell : -1;
    }
    this.gsAny = any;
    writeDecals(this, camera, this.gsScene?.gsView?.gsGrid);
  }
  setupLights(builder, lightNodes) {
    this._initGrid(builder.renderer);
    const lightingModel = builder.context.reflectedLight;
    lightingModel.directDiffuse.toStack(); lightingModel.directSpecular.toStack();
    decalPass(this, builder);   // (the decals first: every light, the sun's and the sky's too, lights the marked surface)
    LightsNode.prototype.setupLights.call(this, builder, lightNodes);
    const T = this._lightsTexture, V = this._cameraViewMatrix, rev = !!builder.renderer.reversedDepthBuffer;
    Fn(() => {
      // (the same for every lamp of the pixel: worked out once)
      const P = positionView, Ng = normalViewGeometry, R = reflect(P.normalize(), normalView).toVar(), rough = roughness;
      const sink = vec3().toVar();   // (where the half of a tube's or sign's light that isn't wanted goes)
      Loop(this.maxLightsPerCluster, ({ i }) => {
        const lightIndex = this._getTile(i);
        If(lightIndex.equal(int(0)), () => { Break(); });
        const li = lightIndex.sub(1);
        If(li.greaterThanEqual(this.gsLampN), () => { Break(); });   // (the decals, after every lamp of the cell)
        const { color, decay, viewPosition, distance, spotDirection, spotOffset } = this._getLightData(li);
        const X = textureLoad(T, ivec2(li, ROW0)).toVar();
        const lightVector = viewPosition.sub(P).toVar(), cut = distance.toVar(), col = color.toVar();
        // a tube or a sign: the nearest point of it, and the point its mirror image shows (Karis 2013, "representative
        // point"; lit from those below), so a long tube is a long highlight on a wet road
        const area = X.z.greaterThan(.5), specV = vec3().toVar(), size = vec3().toVar();
        const picD = vec3(1).toVar(), picS = vec3(1).toVar();   // (a sign's own picture where its light comes from: diffuse, highlight)   // (size: its half length and half height, over how far its highlight's point is)
        If(area, () => {
          cut.assign(X.w);
          const A = textureLoad(T, ivec2(li, ROW0 + 5)), a = V.mul(vec4(A.xyz, 0)).xyz, ha = A.w, d = lightVector.toVar();
          If(X.z.lessThan(1.5), () => {
            const tNear = clamp(dot(d, a).negate(), ha.negate(), ha);
            const L0 = d.sub(a.mul(ha)), Ld = a.mul(ha.mul(2)), rl = dot(R, Ld);
            const tR = clamp(dot(R, L0).mul(rl).sub(dot(L0, Ld)).div(max(dot(Ld, Ld).sub(rl.mul(rl)), 1e-4)), 0, 1).mul(ha.mul(2)).sub(ha);
            lightVector.assign(d.add(a.mul(tNear))); specV.assign(d.add(a.mul(tR)));
            size.assign(vec3(ha, 0, max(length(specV), .05)));
          }).Else(() => {
            const B = textureLoad(T, ivec2(li, ROW0 + 6)), b = V.mul(vec4(B.xyz, 0)).xyz, hb = B.w, n = cross(a, b);
            const nearP = d.add(a.mul(clamp(dot(d, a).negate(), ha.negate(), ha))).add(b.mul(clamp(dot(d, b).negate(), hb.negate(), hb)));
            const den = dot(n, R), s = dot(n, d).div(select(abs(den).lessThan(1e-4), float(1e-4), den)), hit = R.mul(max(s, 0)).sub(d);   // (from the sign's middle)
            const mirP = d.add(a.mul(clamp(dot(hit, a), ha.negate(), ha))).add(b.mul(clamp(dot(hit, b), hb.negate(), hb)));
            lightVector.assign(nearP); specV.assign(select(s.greaterThan(0), mirP, nearP));
            size.assign(vec3(ha, hb, max(length(specV), .05)));
            col.mulAssign(smoothstep(0, .06, dot(d.negate(), n)));   // (its front only)
            // a sign that lights with its own picture (a TV, a video wall, a stained window): its colour where each part of
            // its light comes from, blurred as that part is spread: the diffuse light, from the nearest point, more blurred
            // the further off (a quarter of the picture across from as far off as it is wide: the near part of a sign gives
            // most of the light a wall beside it gets); the highlight, from the mirror point,
            // by roughness (a wet road shows the picture, a dull floor its colours)
            const cell = textureLoad(T, ivec2(li, ROW0 + 7)).y;
            If(cell.greaterThanEqual(0), () => {
              const big = max(ha, hb), sa = clamp(dot(d, a).negate(), ha.negate(), ha), sb = clamp(dot(d, b).negate(), hb.negate(), hb);
              const ma = select(s.greaterThan(0), clamp(dot(hit, a), ha.negate(), ha), sa), mb = select(s.greaterThan(0), clamp(dot(hit, b), hb.negate(), hb), sb);
              const lodD = clamp(log2(length(nearP).div(big)).add(Math.log2(PIC_PX) - 2), 1, Math.log2(PIC_PX));
              const lodS = clamp(log2(max(rough.mul(rough), .002).mul(length(specV)).div(big).mul(PIC_PX / 2).add(1)), 0, Math.log2(PIC_PX));
              picD.assign(pictureAt(cell, vec2(sa.div(ha), sb.div(hb)).mul(.5).add(.5), lodD));
              picS.assign(pictureAt(cell, vec2(ma.div(ha), mb.div(hb)).mul(.5).add(.5), lodS));
            });
          });
        });
        const spotAttenuation = smoothstep(0, 1, dot(lightVector.normalize(), spotDirection).sub(spotOffset)).toVar();
        const inRange = cut.equal(0).or(dot(lightVector, lightVector).lessThanEqual(cut.mul(cut)));
        If(inRange.and(spotAttenuation.greaterThan(0)), () => {
          // a shadow from its slot, and its shape: where this point falls in the lamp's own picture
          If(X.x.greaterThanEqual(0).or(X.y.greaterThanEqual(0)), () => {
            const tx = textureLoad(T, ivec2(li, ROW0 + 7)).x, far = length(lightVector);
            const Q = vec4(P.add(Ng.mul(far.mul(tx).mul(1.5))), 1);   // (pushed out along the surface by a texel and a half where it is: no shadow acne)
            const p = vec4(dot(textureLoad(T, ivec2(li, ROW0 + 1)), Q), dot(textureLoad(T, ivec2(li, ROW0 + 2)), Q), dot(textureLoad(T, ivec2(li, ROW0 + 3)), Q), dot(textureLoad(T, ivec2(li, ROW0 + 4)), Q)).toVar();
            If(p.w.greaterThan(1e-4), () => {
              const ndc = p.xyz.div(p.w), uv = vec2(ndc.x.mul(.5).add(.5), ndc.y.mul(-.5).add(.5));
              const inside = step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1));
              If(X.y.greaterThanEqual(0), () => {
                // (a round lamp's shape fades out towards its picture's edge, where the shape ends and the lamp shines on)
                const edge = select(spotOffset.lessThan(-.5), sm(0, .08, min(min(uv.x, uv.y), min(uv.x.oneMinus(), uv.y.oneMinus()))), inside);
                col.mulAssign(mix(vec3(1), shapeNode(X.y, uv.x, uv.y), edge));
              });
              If(X.x.greaterThanEqual(0).and(inside.greaterThan(.5)), () => {
                const cols = ATLAS_U.x, rows = ATLAS_U.y, spx = ATLAS_U.z, h = float(.5).div(spx);
                const cell = vec2(X.x.mod(cols), floor(X.x.div(cols))), size = vec2(cols, rows);
                const at = cell.add(clamp(uv, h, h.oneMinus())).div(size), tex = vec2(1).div(size.mul(spx));
                const z = rev ? ndc.z.add(ATLAS_U.w) : ndc.z.sub(ATLAS_U.w);
                const k = atlasTex.sample(at.add(tex.mul(vec2(-.5, -.5)))).compare(z).add(atlasTex.sample(at.add(tex.mul(vec2(.5, -.5)))).compare(z))
                  .add(atlasTex.sample(at.add(tex.mul(vec2(-.5, .5)))).compare(z)).add(atlasTex.sample(at.add(tex.mul(vec2(.5, .5)))).compare(z)).mul(.25);
                col.mulAssign(k);
              });
            });
          });
          If(area, () => {
            // three's lighting model three times over (each part of the light from its own point): the diffuse light (and
            // a cloth's sheen) from the nearest point, the highlight from the mirror point, and a wet or lacquered coat's
            // own sharper highlight, each made as much dimmer as its highlight is spread wider. No closer than 20 cm: a
            // lit face is never brighter than itself.
            const { lightingModel: lm, reflectedLight: RL } = builder.context, cc = lm.clearcoat === true, sh = lm.sheen;
            const att = (v) => getDistanceAttenuation({ lightDistance: sqrt(dot(v, v).add(.04)), cutoffDistance: cut, decayExponent: decay });
            const spread = (r) => { const al = max(r.mul(r), .002), k = (h) => al.div(clamp(al.add(h.div(size.z)), 0, 1)); return k(size.x).mul(select(size.y.greaterThan(0), k(size.y), float(1))); };
            const go = (dir, colour, diffuse, specular, coat, sheen) => {
              lm.clearcoat = coat; lm.sheen = sheen;
              lm.direct({ lightDirection: dir, lightColor: colour, reflectedLight: { directDiffuse: diffuse, directSpecular: specular }, lightNode: this }, builder);
              lm.clearcoat = cc; lm.sheen = sh;
            };
            const toS = specV.normalize(), litS = col.mul(att(specV)).mul(picS);
            go(lightVector.normalize(), col.mul(att(lightVector)).mul(picD), RL.directDiffuse, sink, false, sh);
            go(toS, litS.mul(spread(rough)), sink, RL.directSpecular, false, false);
            if (cc) go(toS, litS.mul(spread(clearcoatRoughness)), sink, sink, true, false);
          }).Else(() => {
            builder.lightsNode.setupDirectLight(builder, this, directPointLight({ color: col.mul(spotAttenuation), lightVector, cutoffDistance: cut, decayExponent: decay }));
          });
        });
      });
    }, 'void')();
  }
}

/* ---------- the atlas ---------- */
// The slots' depth, drawn the way three draws a shadow map (ShadowNode.updateShadow: its shadow material over the
// scene, only what casts a shadow, the renderer's state put aside and back), a slot at a time into its square of the
// atlas (the rest kept: the square is emptied first by drawing "far" over it, as WebGPU clears a whole picture or none).
const SHADOW_MAT = new NodeMaterial(); SHADOW_MAT.colorNode = vec4(0, 0, 0, 1); SHADOW_MAT.isShadowPassMaterial = true; SHADOW_MAT.name = 'Lamp shadow'; SHADOW_MAT.blending = NoBlending; SHADOW_MAT.fog = false;
let state = {}, far = null;
const ORTHO = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
// "far" over the whole of what the viewport shows (the slot's square)
function farQuad(rev) {
  if (far?.gsRev === rev) return far;
  const m = new NodeMaterial(); m.name = 'Lamp shadow wipe'; m.vertexNode = vec4(positionGeometry.xy, 0, 1); m.fragmentNode = vec4(0); m.depthNode = float(rev ? 0 : 1);
  m.colorWrite = false; m.depthTest = true; m.depthFunc = AlwaysDepth; m.depthWrite = true; m.fog = false; m.lights = false;
  far = new Mesh(new PlaneGeometry(2, 2), m); far.frustumCulled = false; far.gsRev = rev;
  return far;
}
/**
 * The atlas sized for this many rows of slots of px texels (between frames' drawing: a picture made smaller or bigger
 * in the middle of drawing is thrown away under the frame that used it). Returns it, or null with no slots. owner: the
 * lamp pool drawing into it (another view's pool drawing in between makes ATLAS.gen move on: every slot drawn again).
 */
export function lampAtlas(r, cols, rows, px, owner) {
  if (!rows) { dropAtlas(r); return null; }
  if (ATLAS.owner !== owner) { ATLAS.owner = owner; ATLAS.gen++; }
  const w = cols * px, h = rows * px;
  if (!ATLAS.ready) { ATLAS.ready = true; reversed = !!r.reversedDepthBuffer; if (reversed) DEPTH.compareFunction = GreaterEqualCompare; }
  if (ATLAS.rt.width !== w || ATLAS.rt.height !== h) { ATLAS.rt.setSize(w, h); ATLAS.gen++; marked(); }
  if (ATLAS.made !== ATLAS.gen) { ATLAS.made = ATLAS.gen; empty(r); }
  ATLAS.cols = cols; ATLAS.rows = rows; ATLAS.px = px; ATLAS_U.value.set(cols, rows, px, reversed ? -2e-5 : 2e-5);
  return ATLAS.rt;
}
/**
 * Shrinks the atlas to nothing (no lamp has a shadow). r: the renderer, to make the small picture at once (materials
 * with lamps keep the atlas bound whether or not a lamp has a slot, and a picture that was made smaller is thrown away
 * until it is made again: drawn with as it is, the chip refuses the frame).
 */
export function dropAtlas(r) {
  if (ATLAS.rt.width <= 1) return;
  ATLAS.rt.setSize(1, 1); ATLAS.gen++; ATLAS.rows = 0; marked();
  if (r) { ATLAS.made = ATLAS.gen; empty(r); }
}
// The atlas made for the chip (again, at its new size) and emptied: three empties a picture's depth only the first
// time it is drawn into without a clear. (Never marked as changed by hand: three would make it again at the same size,
// behind the stand-in's back and under the pass it keeps for drawing into it.)
function empty(r) {
  r.initRenderTarget(ATLAS.rt);
  const was = r.getRenderTarget(); r.setRenderTarget(ATLAS.rt); r.clearDepth(); r.setRenderTarget(was);
}
/**
 * Draws one slot (lamps.js LampPool.finish): its stand-in light's shadow camera, into its square, emptied first.
 * mask: the camera's layers (the view camera's: what the frame draws).
 */
export function drawSlot(r, scene, slot, mask) {
  const rt = ATLAS.rt; if (!rt) return;
  const { cols, px } = ATLAS, cam = slot.proxy.shadow.camera;
  const x = (slot.i % cols) * px, y = Math.floor(slot.i / cols) * px;   // (a picture's viewport counts rows from the top on WebGPU)
  const fn = (object, sc, camera, geometry, material, group, lightsNode, clippingContext, passId) => {
    if (object.castShadow !== true) return;
    object.onBeforeShadow(r, object, camera, cam, geometry, sc.overrideMaterial, group);
    r.renderObject(object, sc, camera, geometry, material, group, lightsNode, clippingContext, passId);
    object.onAfterShadow(r, object, camera, cam, geometry, sc.overrideMaterial, group);
  };
  const m0 = cam.layers.mask; cam.layers.mask = mask;
  state = RendererUtils.resetRendererAndSceneState(r, scene, state);
  r.setClearColor(0x000000, 0); r.autoClear = false;
  r.setRenderTarget(rt);
  rt.viewport.set(x, y, px, px); rt.scissor.set(x, y, px, px); rt.scissorTest = true;
  const name = scene.name;
  try {
    r.render(farQuad(reversed), ORTHO);
    scene.overrideMaterial = SHADOW_MAT; r.setRenderObjectFunction(fn); scene.name = `Shadow Map [ ${slot.proxy.name} ]`;
    const go = () => r.render(scene, cam);
    if (r.lighting?.shadowDraw) r.lighting.shadowDraw(scene, go); else go();
  } finally {
    scene.name = name; rt.viewport.set(0, 0, rt.width, rt.height); rt.scissor.set(0, 0, rt.width, rt.height); rt.scissorTest = false;
    RendererUtils.restoreRendererAndSceneState(r, scene, state); cam.layers.mask = m0;
  }
}
export const lampAtlasInfo = () => ATLAS;
