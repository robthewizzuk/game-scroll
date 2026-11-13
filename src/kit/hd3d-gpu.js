// The Next Gen look on WebGPU: three.js's WebGPURenderer with the screen effects written as TSL nodes.
// It loads on any device that has WebGPU (there is no setting: WebGPU where supported, else WebGL);
// gpu.js imports it. hd3d.js asks gpuFits(view) each frame and draws a view here only when
// everything in it has a WebGPU version, so a game with a part that doesn't yet (docs/webgpu-move.md)
// keeps drawing on WebGL as before.
//
// The pieces match hd3d.js's FINAL_EFFECTS one for one (bloom, grade, glare, tone, vignette, grain,
// hurt, smoothing), plus three's own GTAO for ambient occlusion and the outdoor air as a fog node.
// scripts/look-compare.cjs --webgpu draws the same scenes both ways and compares them.
// Kit use only.
import { StandardDrawingPipeline, RenderPipeline, PMREMGenerator, Vector2, Vector3, Vector4, Color, BackSide, Sprite, Group, InstancedMesh, BufferGeometry, Frustum, Sphere, InstancedBufferAttribute as IBA, SpriteNodeMaterial, InstancedBufferAttribute, AdditiveBlending, NormalBlending, Node, BlendMode, MaterialBlending,
  MeshBasicNodeMaterial, NodeMaterial, Data3DTexture, RectAreaLightNode, MeshSSSNodeMaterial, PhysicalLightingModel, MeshStandardNodeMaterial, MeshPhysicalNodeMaterial, QuadMesh, MRTNode, OutputStructNode, PMREMNode, CubeRenderTarget, CubeCamera, RenderTarget, Texture, Matrix4, HalfFloatType, DepthTexture, NearestFilter, Storage3DTexture, LinearFilter, LessEqualCompare, NoToneMapping, ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, SRGBColorSpace, LinearSRGBColorSpace, Matrix3, ShadowNode, DataTexture, RedFormat, RGFormat, UnsignedByteType, NoColorSpace, Mesh, BufferAttribute, OrthographicCamera, AlwaysDepth, RepeatWrapping } from 'three/webgpu';
import {
  pass, mrt, output, velocity, normalView, uniform, texture, screenUV, screenCoordinate, screenSize, renderOutput, Fn,
  vec2, vec3, vec4, float, mix, smoothstep, dot, exp, length, max, pow, clamp, log2, fract, sin, abs, select,
  positionWorld, cameraPosition, instancedBufferAttribute, uv, rtt, depth, ivec2, min, materialEmissive, distance,
  attribute, positionViewDirection, vertexColor, normalWorld, normalWorldGeometry, normalViewGeometry, positionLocal, positionGeometry, positionPrevious, modelWorldMatrix, modelWorldMatrixInverse,
  materialColor, materialOpacity, materialRoughness, cos, floor, step, fwidth, dFdx, dFdy, normalize, uniformArray, Loop, int, If, sqrt,
  roughness, specularColor, specularColorBlended, specularF90, diffuseContribution, BRDF_GGX, BRDF_Lambert, F_Schlick,
  modelViewProjection, acos, getParallaxCorrectNormal, getViewPosition, interleavedGradientNoise, Break, cameraViewMatrix, shadow as shadowOf, texture3D, parallaxDirection, normalMap, instanceIndex, sample, packNormalToRGB, unpackRGBToNormal, storageTexture3D, textureStore, diffuseColor, mx_noise_float, uvec3, ivec3,
} from 'three/tsl';
import * as TSL from 'three/tsl';
import { lut3D } from 'three/examples/jsm/tsl/display/Lut3DNode.js';
import { tslOps } from './models/ops.js';
import { gpuCull, gpuCullFits } from './props-gpu.js';
import { OCC_LAYER } from './occlude.js';
import { sendUsed } from './gpu.js';
import { ORIGIN } from './origin.js';
import { eachShown, listPipeline } from './scene-list.js';
import { halfFn, halfWanted, halfKey } from './half.js';
export { HALF, halfCheck, halfInfo, halfTexts } from './half.js';
import { RECIPES } from './models/recipes.js';
import { seeded } from './models/materials.js';
import { oitPass } from 'three/examples/jsm/tsl/display/OITPassNode.js';
import { lensflare } from 'three/examples/jsm/tsl/display/LensflareNode.js';
import { ssgi } from 'three/examples/jsm/tsl/display/SSGINode.js';
import { vxgi } from 'three/examples/jsm/lighting/vxgi/VXGINode.js';
import { LightProbeGrid } from 'three/examples/jsm/lighting/LightProbeGrid.js';
// three's denoise makes its noise picture from Math.random(), a new one for every node. Two views of the same scene, or
// the same view on two runs, then smooth their ambient occlusion a little differently: a few pixels a frame, so no two
// pictures with ambient occlusion in them could be compared exactly on WebGPU. This is the same picture, from a fixed
// seed, made once and given to every denoise node.
let DN_NOISE = null;
function denoiseNoise() {
  if (DN_NOISE) return DN_NOISE;
  let s = 0x9e3779b9; const random = () => { s = s + 0x6d2b79f5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const simplex = new SimplexNoise({ random }), size = 64, data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    const o = (i * size + j) * 4;
    data[o] = (simplex.noise(i, j) * .5 + .5) * 255; data[o + 1] = (simplex.noise(i + size, j) * .5 + .5) * 255; data[o + 2] = (simplex.noise(i, j + size) * .5 + .5) * 255; data[o + 3] = (simplex.noise(i + size, j + size) * .5 + .5) * 255;
  }
  const t = DN_NOISE = new DataTexture(data, size, size); t.wrapS = t.wrapT = RepeatWrapping; t.needsUpdate = true;
  return t;
}
// v.tone (hd3d.js): three.js's own tone mappers
const TONE = { aces: ACESFilmicToneMapping, neutral: NeutralToneMapping, agx: AgXToneMapping };
export { LightProbeGrid };
export { bakeProbe };   // v.bakeLight() on this renderer
export { gpuFlood } from './flood-gpu.js';
export { gpuFluid } from './fluid-gpu.js';
export { gpuGas } from './gas-gpu.js';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { ClusteredLighting } from 'three/examples/jsm/lighting/ClusteredLighting.js';
import ClusteredLightsNode from 'three/examples/jsm/tsl/lighting/ClusteredLightsNode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { crowdLook } from './crowd-gpu.js';
import { sdfLook, fxPlan, fxStages, fxFrame, fxDispose, reflMRT, reflStage, reflFrame, reflDispose, bakeProbe } from './hd3d-gpu-fx.js';
// Ray traced reflections (hd3d-gpu-trace.js) load the first time a view wants them (something marked shiny on
// one of the best phones), not with every 3D game: the part brings a tree builder and a simplifier with it.
let TR = null, trLoad = null, trTries = 0;
/** The ray tracing part once it has loaded ({ Tracer, ... }; null until then: asking starts the load, twice at most). */
export function traceKit() {
  if (!TR && !trLoad && trTries < 2) { trTries++; trLoad = import('./hd3d-gpu-trace.js').then(m => { TR = m; }, e => { trLoad = null; console.warn('[gs] ray traced reflections did not load: ' + (e?.message || e)); }); }
  return TR;
}
/** Can this chip trace? (The four lists a ray reads have to be reachable where pixels are drawn.) */
export function traceFits(r) {
  const l = r.backend?.device?.limits; if (!l) return false;
  return Math.min(l.maxStorageBuffersInFragmentStage ?? l.maxStorageBuffersPerShaderStage ?? 0, l.maxStorageBuffersPerShaderStage ?? 0) >= 4;
}
import { S2_HOLD } from './sgsr2.js';
import { FrameGen, StillCheck, frameGenMRT, seeThrough, fgPrevVP, newPose, copyPose, homography, warpUV, refreshesSince, sharpAt } from './framegen.js';
// where the drawing's centre is in the world (origin.js): patterns made from where a point is add it back
const ORG = uniform(ORIGIN);

const LUM_K = [.2126, .7152, .0722], LUM = vec3(...LUM_K);

/** The studio reflections for this renderer (WebGL's can't be shared: it lives on the other GPU API). */
// (three's WebGPU PMREMGenerator never updates its cube camera's projection after the first bake, so
// the first bake's near and far stay for all of them: every bake here uses the same, ENV_FAR)
const ENV_FAR = 5000;
export function studioEnv(r) {
  const pm = new PMREMGenerator(r), t = pm.fromScene(new RoomEnvironment(), .04, .1, ENV_FAR).texture; pm.dispose();
  return t;
}

/** Sky reflections and light from a scene (hd3d.js envFrom, gs.sky's { env: true }), on this renderer. */
const pmGens = new WeakMap();
export function envFrom(r, scene, { size = 256, blur = .03 } = {}) {
  let pm = pmGens.get(r); if (!pm) pmGens.set(r, pm = new PMREMGenerator(r));
  return pm.fromScene(scene, blur, .1, ENV_FAR, { size });
}

// Light through thin flesh (pbr's sss with `thin`: a person's skin). Two things on top of the usual light, both only where the
// mesh says it is thin (F.thin 0..1, measured when it was sculpted): the far side lit, glowing through wherever you look from
// (an ear with the sun behind it), and three's own term, brighter still seen straight against the light.
// Light square on to the far side has to have come from straight behind: it only counts as far as that way is open (F.open:
// the skull is behind an ear, and a shadow map is too coarse to tell an ear from the head a centimetre behind it).
class FleshModel extends PhysicalLightingModel {
  constructor(m, F) { super(m.useClearcoat, m.useSheen, m.useIridescence, m.useAnisotropy, m.useTransmission, m.useDispersion); this.F = F; }
  direct(input, builder) {
    const { lightDirection, lightColor, reflectedLight } = input, F = this.F;
    if (input.lightNode?.light?.userData.gsFill) {   // (HDView.faceLight: a film crew's fill lights skin softly, as a big source does, and puts no shine
      // of its own on it: a small light beside the camera glinted off every pore and made a hot spot on a forehead)
      const nl = normalView.dot(lightDirection).add(.25).div(1.25).saturate();
      reflectedLight.directDiffuse.addAssign(nl.mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseContribution })));
      return;
    }
    const on = normalView.dot(lightDirection).negate().toVar(), back = on.add(.3).div(1.3).saturate().mul(F.back);
    const through = positionViewDirection.dot(lightDirection.add(normalView.mul(F.distortion)).normalize().negate()).saturate().pow(F.power).mul(F.scale);
    const way = mix(float(1), F.open, smoothstep(.35, .85, on));
    reflectedLight.directDiffuse.addAssign(F.colour.mul(lightColor).mul(back.add(through).mul(way).add(F.ambient).mul(F.attenuation).mul(F.thin)));
    if (F.skin) this.skin(input); else super.direct(input, builder);
  }
  // Skin (pbr's sss.skin: a real face). Light goes in, spreads under the skin and comes out a little way off, red furthest (it
  // travels millimetres in skin, blue hardly at all). Worked out as pre-integrated skin shading does (Penner and Borshukov, GPU Pro 2),
  // without its picture: where the surface turns faster than the light spreads (a nose, a chin, a cheek turning from the sun) light
  // reaches on round past where it would stop, so the line between lit and unlit is soft and warm instead of a grey edge. How fast
  // the surface turns is read from the screen (the smooth normal's change against the position's, a pixel to the next). And the
  // pores and fine lines darken only the light that does not travel: red, which has come from millimetres off, sees the smooth
  // surface under them, blue the pores (Penner's blurred normals); they all show in the shine. The shine is two lobes, as on a real
  // face: a tight one off the skin's oil and a broad one off its fine roughness.
  skin({ lightDirection: L, lightColor, reflectedLight }) {
    const F = this.F, nG = normalViewGeometry, lg = nG.dot(L), ld = normalView.dot(L), nl = vec3(lg, mix(lg, ld, .45), ld);
    const curve = length(fwidth(nG)).div(max(length(fwidth(positionView)), 1e-6));   // (1 / metres: a nose's tip is about 150, a cheek 20)
    const w = vec3(.62, .27, .14).mul(curve.mul(.02).clamp(.35, 1)).mul(F.wrap);
    const d = nl.add(w).div(w.add(1)).saturate(), lit = pow(d, w.add(1));   // (lit side as Lambert's; the reach past the edge in a tail, red's longest)
    const H = L.add(positionViewDirection).normalize(), fr = F_Schlick({ f0: specularColor, f90: specularF90, dotVH: positionViewDirection.dot(H).saturate() });
    reflectedLight.directDiffuse.addAssign(lit.mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseContribution })).mul(fr.oneMinus()));
    const spec = BRDF_GGX({ lightDirection: L, f0: specularColorBlended, f90: specularF90, roughness: roughness.mul(.92) }).mul(.8)
      .add(BRDF_GGX({ lightDirection: L, f0: specularColorBlended, f90: specularF90, roughness: roughness.mul(1.4).min(1) }).mul(.2));
    reflectedLight.directSpecular.addAssign(ld.saturate().mul(lightColor).mul(spec).mul(this.multiScatteringCompensation));
  }
}

/* ---------- kit materials with a shader of their own, as node materials ---------- */
// hd3d.js swaps a mesh's material for its twin here while the view draws on WebGPU (material.userData.gsGpu
// names it). The twin reads the WebGL material's own uniform objects, so changes show on both.
export const gpuMaterials = {
  // pbr(col, { tex, depth }): parallax occlusion mapping (the classic steep-parallax march with a final
  // interpolation, as in Unreal's and Unity's POM nodes). three.js only has plain parallax offset
  // (parallaxUV), so the march is ours, on its tangent-space view direction (parallaxDirection: from
  // the screen-space derivatives when the mesh has no tangents). The surface's maps are read at the
  // marched place; height is surface()'s height layer (white raised).
  pom(gm) {
    const m = new (gm.isMeshPhysicalMaterial ? MeshPhysicalNodeMaterial : MeshStandardNodeMaterial)(), P = gm.userData.pom;
    for (const k in gm) if (k !== 'uuid' && k !== 'id' && k !== 'type') m[k] = gm[k];   // (as three's own NodeLibrary.fromMaterial)
    const H = texture(P.height), rp = P.height.repeat, depth = float(P.depth);
    const base = uv().mul(vec2(rp.x, rp.y)).add(vec2(P.height.offset.x, P.height.offset.y));
    // how many of the surface's texels one drawn pixel covers: its relief goes first (4 to 10), then its pattern
    const SIZE = P.height.image?.width || 256;
    const tpp = max(length(dFdx(base)), length(dFdy(base))).mul(SIZE).toVar('pomTpp'), far = smoothstep(4, 10, tpp).toVar('pomFar');
    const puv = Fn(() => {
      const gx = dFdx(base).mul(MIP_K), gy = dFdy(base).mul(MIP_K), h = q => H.sample(q).grad(gx, gy).r;
      const V = parallaxDirection.normalize(), N = 16, step = float(1 / N);
      // far off the relief is finer than the picture can show: marched there it only crawls as the camera moves
      // (roof tiles through a swaying scope), so it flattens out and the march stops
      const near = float(1).sub(far).toVar();
      const d = V.xy.div(max(V.z, .25)).mul(depth).mul(near).mul(step);   // (flat angles capped, or the march runs off sideways)
      const cur = base.toVar(), lay = float(0).toVar(), mapD = float(1).sub(h(base)).toVar();
      Loop(N, () => { If(lay.greaterThanEqual(mapD).or(near.lessThanEqual(0)), () => { Break(); }); cur.subAssign(d); lay.addAssign(step); mapD.assign(float(1).sub(h(cur))); });
      const prev = cur.add(d), after = mapD.sub(lay), before = float(1).sub(h(prev)).sub(lay).add(step);
      return mix(cur, prev, after.div(after.sub(before)).clamp(0, 1));
    })().toVar('pomUV');
    // The maps: sharper under SGSR 2 (MIP_K, see sharpMips) while the pattern is big enough to show. A pattern
    // only a few drawn pixels across (a roof's tiles from a hill away) is too fine for the upscaler to hold steady
    // from frame to frame: a tile's bump catches the light on one frame and not the next, and the roof shimmers.
    // So as it gets that small (a tenth of the texture is taken as one tile, brick or plank: 5 pixels across
    // down to 1.6) the bumps flatten and the colour goes over to the texture's own average: a calm, even surface.
    // (Measured on Long Shadow's tiled roofs under a slow pan, upscaled 1.5 times: the change from frame to frame
    // that steady motion doesn't explain fell to under a third where a tile is 2 pixels, a fifth where it is under 1.)
    const calm = smoothstep(SIZE / 50, SIZE / 16, tpp).toVar('pomCalm'), K = mix(MIP_K, float(1), calm).toVar('pomK');
    const at = (t, q) => texture(t, q).grad(dFdx(base).mul(K), dFdy(base).mul(K)), even = t => texture(t, base).level(Math.max(0, Math.log2(SIZE) - 2));
    if (gm.map) m.colorNode = mix(at(gm.map, puv), even(gm.map), calm).mul(materialColor);
    if (gm.normalMap) m.normalNode = normalMap(mix(at(gm.normalMap, puv), vec4(.5, .5, 1, 1), calm), uniform(gm.normalScale));
    if (gm.roughnessMap) m.roughnessNode = at(gm.roughnessMap, puv).g.mul(materialRoughness);
    m.map = m.normalMap = m.roughnessMap = null;   // (read above at the marched place; three's materialColor would multiply the map in again)
    m.name = gm.name || 'pom';
    return m;
  },
  // gs.models.material: the textures as baked (or laid on by position: solid; or with each tile moved: scatter),
  // and a second, close-up version that works the recipe out exactly per pixel (ops.js in TSL), used
  // while the thing is within a few metres (hd3d.js swapTwins picks, once it has built in the background)
  recipe(gm) { return recipeTwin(gm); },
  // pbr(col, { sss }): three's subsurface scattering material, with everything else copied as three does.
  // sss.thin (a person's skin): the mesh says how thin it is at each point and how open behind (a `gsThin` attribute, two numbers 0..1),
  // and light comes through only there (FleshModel). Three's own has no idea how thick a thing is: lit from behind, a whole head glowed like its ears.
  sss(gm) {
    const S = gm.userData.sss, m = S.thin ? new MeshPhysicalNodeMaterial() : new MeshSSSNodeMaterial();
    for (const k in gm) if (k !== 'uuid' && k !== 'id' && k !== 'type') m[k] = gm[k];   // (as three's own NodeLibrary.fromMaterial)
    if (S.thin) {   // (the soft tinted rim stays, as on WebGL: it stands for the light that scatters about under the skin, which this does not do;
      // real skin (S.skin) works that light out itself, FleshModel.skin(), and has no rim)
      const at = attribute('gsThin', 'vec2'), F = { ...S, colour: uniform(S.colour), thin: at.x, open: at.y, wrap: float(S.skin === true ? 1 : S.skin || 0) };
      if (S.skin) { m.sheen = 0; m.ior = 1.4; }   // (skin reflects a little less than glass or plastic: 2.8% straight on)
      // a real face's fine lines bend the light (a picture of how high the skin is, on the face's own UVs: human-paint.js paintDetail),
      // over the pores' own normals; and its oily parts (the middle of the forehead, the nose, the chin, the lips) shine more
      const FD = S.skin && gm.userData.faceDetail;
      if (FD) {
        const D = texture(FD, uv(1)), pores = gm.normalMap ? normalMap(texture(gm.normalMap), uniform(gm.normalScale)) : normalViewGeometry;
        // (and the lines that come with its expressions, faceWrinkles: four kinds, each sunk in as far as the person's live face shows it this
        // frame, userData.gsWrinkle on the mesh, human-face.js; a face of the same look but another expression shares the material, not the frame)
        const FW = gm.userData.faceWrinkles, wr = FW && uniform(new Vector4()).onObjectUpdate(({ object }) => object?.userData?.gsWrinkle ?? NO_WRINKLE);
        m.normalNode = bumpN(FW ? D.r.sub(texture(FW, uv(1)).dot(wr).mul(2.6)) : D.r, float(.00016), pores);
        // (and rougher where the pores turn the surface faster than a pixel can show, Kaplanyan and Hoffman's specular antialiasing: a pore
        // a pixel or two across had each caught the light as a glint of its own, so a close face glittered like wet sand, darkest skin most)
        const r0 = materialRoughness.mul(gm.roughnessMap ? texture(gm.roughnessMap).g : float(1)).mul(D.g.mul(-.18).add(1)), ex = dFdx(normalView), ey = dFdy(normalView);
        const spread = ex.dot(ex).add(ey.dot(ey)).mul(.5).min(.18).toVar();
        m.roughnessNode = sqrt(r0.mul(r0).add(spread)).min(1);
        // (and less of it where the skin is dry, and where the pores are too small to see: a pore's hollow shines little, so as they blur into
        // the surface it is their average that shows, a duller sheen. Kept at full strength, a dark face read as plastic, one smooth sheen)
        m.specularIntensityNode = D.g.mul(.4).add(.72).mul(float(1).sub(spread.div(.18).mul(.25)));
      }
      m.setupLightingModel = function () { return new FleshModel(this, F); };
      // what light comes through throws no shadow: an ear would shade its own far side, where the light comes out
      // (a face turned from the light is tested against itself in the shadow map, and the map's own grain shows)
      m.maskShadowNode = F.thin.lessThan(.3);
    } else {
      if (gm.sheenColor?.equals(S.colour) && gm.sheenRoughness === .7) m.sheen = 0;   // (the WebGL stand-in)
      m.thicknessColorNode = uniform(S.colour); m.thicknessPowerNode = float(S.power); m.thicknessScaleNode = float(S.scale);
      m.thicknessDistortionNode = float(S.distortion); m.thicknessAmbientNode = float(S.ambient); m.thicknessAttenuationNode = float(S.attenuation);
    }
    m.name = gm.name || 'sss';
    return m;
  },
  // gs.sky's dome (sky.js): the sky gradient and sun glow, or Preetham scattering (pSun.z > 0), the sun's
  // disc, and drifting clouds lit from the sun's side
  skyDome(gm) {
    const u = gm.uniforms, L = k => live(u[k]), clouds = 'CLOUDS' in (gm.defines || {});
    const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    m.name = 'sky';
    m.colorNode = Fn(() => {
      const d = normalize(positionLocal), sd = normalize(L('sunDir')), h = clamp(d.y, -1, 1), s = max(dot(d, sd), 0);
      const pS = L('pSun'), pBR = L('pBR'), pBM = L('pBM'), sunCol = L('sunCol'), cloud = L('cloud'), c = vec3(0).toVar();
      If(pS.z.greaterThan(0), () => {
        // light scattered by the air towards the eye (Preetham)
        const zen = acos(max(d.y, 0)), inv = float(1).div(cos(zen).add(pow(float(93.885).sub(zen.mul(57.29578)), -1.253).mul(.15)));
        const fex = exp(pBR.mul(8400).mul(inv).add(pBM.mul(1250).mul(inv)).negate());
        const ct = dot(d, sd), g2 = pS.y.mul(pS.y);
        const r = pBR.mul(pow(ct.mul(.5).add(.5), 2).add(1).mul(.0596831)).add(pBM.mul(float(1).sub(g2).mul(.0795775).div(pow(float(1).sub(pS.y.mul(2).mul(ct)).add(g2), 1.5)))).div(pBR.add(pBM));
        const lin = pow(r.mul(pS.x).mul(fex.oneMinus()), vec3(1.5)).mul(mix(vec3(1), sqrt(r.mul(pS.x).mul(fex)), pS.w));
        const c1 = lin.add(fex.mul(.1)).mul(.04).add(vec3(0, .0003, .00075)).mul(pS.z);
        c.assign(mix(c1, c1.mul(.55), clamp(h.negate().mul(3), 0, 1)));
        // soft knee (as sky.js): the glow round a low sun is bright, but no brighter than a painted sky's
        const l = max(c.r, max(c.g, c.b)), e = max(l.sub(1), 0);
        c.mulAssign(select(l.greaterThan(1), float(1).add(e.div(float(1).add(e.div(1.5)))).div(max(l, 1e-4)), float(1)));
      }).Else(() => {
        const c1 = mix(L('horizon'), L('top'), pow(max(h, 0), .55));
        c.assign(mix(c1, L('horizon').mul(.55), clamp(h.negate().mul(3), 0, 1)).add(sunCol.mul(pow(s, 24).mul(.35).add(pow(s, 90).mul(.4)))));
      });
      let sun = smoothstep(L('size'), L('size').add(.0004), s);
      if (clouds) {
        // (worked out everywhere and faded out below the horizon: textures can't be read inside a branch)
        const q = d.xz.div(max(h.add(.16), .13)).mul(.2).add(vec2(1, .4).mul(cloud.z)), N = u.noise.value;
        const n = texture(N, q).r.mul(.62).add(texture(N, q.mul(3.1).add(.37)).g.mul(.38));
        const cv = cloud.x.mul(float(1).sub(cloud.y.mul(pow(max(dot(normalize(d.xz.add(1e-4)), normalize(sd.xz.add(1e-4))), 0), 3)).mul(float(1).sub(smoothstep(.02, .22, h)))));
        const cov = smoothstep(cv.oneMinus(), float(1.1).sub(cv.mul(.62)), n), dens = smoothstep(cv.oneMinus(), float(1.32).sub(cv.mul(.5)), n);
        const cc = mix(L('cloudLit'), L('cloudDark'), dens.mul(.9)).add(sunCol.mul(cov).mul(dens.oneMinus()).mul(pow(s, 5).mul(2.2).add(.18)));
        const a = cov.mul(smoothstep(-.03, .1, h)).mul(step(-.03, h));
        c.assign(mix(c, cc.add(vec3(.75, .8, 1).mul(cloud.w)), a.mul(.97))); sun = sun.mul(a.oneMinus());
      }
      return c.add(sunCol.mul(sun).mul(L('disc'))).add(vec3(.25, .27, .32).mul(cloud.w).mul(max(h, 0).mul(.6).add(.4)));
    })();
    return m;
  },
};

/* ---------- outdoor air (hd3d.js AIR_GLSL: haze and valley mist; the 'air' look effect) ---------- */
// The same numbers as the WebGL patch: hd3d's AIR uniforms are copied in each frame (airSync).
export function airNodes(AIR) {
  const U = {
    sun: uniform(new Vector3(0, 1, 0)), c: uniform(new Color()), cs: uniform(new Color()), haze: uniform(0),
    mist: uniform(new Vector3()), patchy: uniform(0), drift: uniform(new Vector2()), noise: null,
  };
  const sync = () => {
    U.sun.value.copy(AIR.gsSun.value); U.c.value.copy(AIR.gsAirC.value); U.cs.value.copy(AIR.gsAirSun.value); U.haze.value = AIR.gsHaze.value;
    const m = AIR.gsMist.value; U.mist.value.set(m.x, m.y, m.z); U.patchy.value = m.w; U.drift.value.copy(AIR.gsDrift.value);
  };
  let fogNode = null;
  const node = () => fogNode ||= Fn(() => {
    const wp = positionWorld, d = wp.sub(cameraPosition), t = length(d), rd = d.div(max(t, 1e-3));
    const haze = float(1).sub(exp(t.mul(U.haze).negate()));
    const k = rd.y.mul(U.mist.y);
    const span = select(abs(k).lessThan(1e-4), t, float(1).sub(exp(t.mul(k).negate())).div(k));
    const fy = U.mist.x.mul(exp(U.mist.y.mul(cameraPosition.y.sub(U.mist.z)).negate())).mul(span);
    const n = texture(AIR.gsNoise.value, wp.xz.add(ORG.xz).mul(.006).add(U.drift.mul(1.7))).a;   // (patches where they are in the world: origin.js)
    const mist = float(1).sub(exp(max(fy, 0).mul(mix(float(1), n.mul(1.3).add(.35), U.patchy)).negate()));
    const s = max(dot(rd, U.sun), 0);
    const f = float(1).sub(float(1).sub(haze).mul(float(1).sub(mist)));
    return vec4(mix(output.rgb, mix(U.c, U.cs, pow(s, 6).mul(.9)), f), output.a);
  })();
  return { sync, node };
}

/* ---------- GPU particles (hd3d.js Particles) ---------- */
// WebGL draws them as points with a shader of their own; here they are instanced sprites reading the
// same arrays (position, size, tint), with the same round soft or glowing dot. size is the dot's
// width in metres, as on WebGL.
// Named looks (looks.js lookPatch) as nodes on the material, which three copies onto the node material
// it makes from it. 'air' is the scene's fog node instead (airNodes).
const live = o => uniform(o.value).onRenderUpdate(() => o.value);   // follows the { value } the game changes
// Frames drawn (GpuChain.draw counts them), and a { value } as it was at the frame before this one: for
// motion that a shader makes itself (three only knows a mesh's matrices and bones from the frame before)
const DRAWN = { n: 0 };
const lastFrame = o => {
  const obj = typeof o.value === 'object', prev = obj ? o.value.clone() : null, cur = obj ? o.value.clone() : null;
  let seen = -1, p = o.value, c = o.value;
  return uniform(obj ? prev : o.value).onRenderUpdate(() => {
    if (seen !== DRAWN.n) {
      if (obj) { if (seen < 0) cur.copy(o.value); prev.copy(cur); cur.copy(o.value); } else { p = seen < 0 ? o.value : c; c = o.value; }
      seen = DRAWN.n;
    }
    return obj ? prev : p;
  });
};
// A look that changes the colour after the material's own (map, then vertex colours, as WebGL's
// color_fragment leaves it): fn(rgb) => rgb. Node materials multiply vertex colours in after colorNode,
// so the result is divided by them here; looks stack (each starts from the one before).
function afterColor(m, o, fn) {
  // (three multiplies the vertex colours, and each copy's own colour, in after the colour node: the look is given
  // the colour with them in and what it answers has them divided out again, so snow on tinted copies is white)
  const vc = m.vertexColors && o?.geometry?.attributes?.color ? vertexColor() : null, ic = o?.instanceColor && TSL.instanceColor ? TSL.instanceColor : null;
  const base = m.colorNode ? vec4(m.colorNode) : materialColor; let d = base.rgb; if (vc) d = d.mul(vc.rgb); if (ic) d = d.mul(ic);
  let out = fn(d); if (vc) out = out.div(max(vc.rgb, 1e-4)); if (ic) out = out.div(max(ic, 1e-4));
  m.colorNode = vec4(out, base.a);
}
const hash2 = p => { const a = fract(vec3(p.x, p.y, p.x).mul(.1031)), b = a.add(dot(a, a.yzx.add(33.33))); return fract(b.x.add(b.y).mul(b.z)); };
// hd3d.js v.room(): the room's own cube picture, read box-projected. The reflection direction comes from
// three's own (roughness bend and all, through the context's getUV), then is moved to where it meets the
// room's walls, as the WebGL patch does.
class BoxPMREM extends PMREMNode {
  constructor(tex, at, size) { super(tex); this.gsAt = at; this.gsSize = size; }
  setup(builder) {
    const ctx = builder.getContext(), g = ctx.getUV;
    if (!g || ctx.gsBox) return super.setup(builder);
    builder.setContext({ ...ctx, gsBox: true, getUV: (n, b) => getParallaxCorrectNormal(g(n, b), this.gsSize, this.gsAt) });
    try { return super.setup(builder); } finally { builder.setContext(ctx); }
  }
}
/** The WebGPU picture of a room (v.room): its cube target, baked from the room's middle. */
export function bakeRoom(r, scene, s) {
  const g = s.gpu ||= { rt: new CubeRenderTarget(s.size, { type: HalfFloatType }) };
  const cc = g.cam ||= new CubeCamera(.05, s.far, g.rt);
  cc.position.copy(s.uniforms.gsRoomAt.value); scene.add(cc); cc.updateMatrixWorld(true);
  try { cc.update(r, scene); } finally { cc.removeFromParent(); }
  g.rt.texture.needsPMREMUpdate = true;
}
// leaves and fronds: alpha that thins less in the mips (outlines that hold up far away), light through towards
// the sun, both sides lit alike (looks.js leaves / fronds fragment)
function seeThroughLeaf(m, o, u) {
  const lq = uv().mul(live(u.lkAtlas)), dx = dFdx(lq), dy = dFdy(lq);
  m.opacityNode = (m.opacityNode ? float(m.opacityNode) : materialOpacity).mul(float(1).add(max(0, log2(max(dot(dx, dx), dot(dy, dy))).mul(.5)).mul(.35)));
  afterColor(m, o, c => c.mul(float(1).add(live(u.lkGlow).mul(pow(max(dot(normalize(positionWorld.sub(cameraPosition)), live(u.lkSun)), 0), 4)))));
  if (!m.normalMap) m.normalNode = normalViewGeometry;
}
// looks.js PART_GLSL: a leaf brushed aside by what walks through a gs.outdoors.Marks grass field, more the higher it
// is on its plant: (world point, height) => a world offset. Only for a material given the field before it was first drawn.
function partPush(u) {
  if (!u.lkPart?.value) return null;
  return (wp, h, cap = null) => {
    const PA = live(u.lkPartAt), K = live(u.lkPartK), pd = abs(wp.xz.sub(PA.xy));
    const pk = texture(u.lkPart.value, wp.xz.mul(PA.z)).onRenderUpdate(() => u.lkPart.value || BLANK_PART()).mul(step(max(pd.x, pd.y), PA.w));
    let up = smoothstep(0, K.y, h).mul(K.x); if (cap) up = up.mul(cap);
    const ln = pk.rg.mul(2).sub(1.00392).mul(step(.5, pk.a));
    return vec3(ln.x.mul(up), length(ln).mul(up).mul(-.35), ln.y.mul(up));
  };
}
export const gpuLooks = {
  // gs.fx3d's 3D text (text3d.js): distance-field letters
  sdf: sdfLook,
  // gs.props.Crowd (crowd.js): members posed from their kind's texture of moves
  crowd: (m, s, o) => crowdLook(m, s, o, afterColor),
  // hd3d.js v.room(): box-projected reflections
  room(m, s) {
    const g = s.gpu ||= { rt: new CubeRenderTarget(s.size, { type: HalfFloatType }) };
    m.envNode = new BoxPMREM(g.rt.texture, live(s.uniforms.gsRoomAt).sub(ORG), live(s.uniforms.gsRoomSize));   // (the room's middle near the drawing's centre, as positionWorld is: origin.js)
  },
  // hd3d.js pulse(): a glowing ring at distance r from a point
  pulse(m, s) {
    const u = s.uniforms, d = distance(positionWorld, live(u.gsPulseAt).sub(ORG)), r = live(u.gsPulseR), w = float(u.gsPulseW.value);
    const band = exp(d.sub(r).div(w).pow(2).negate()).add(float(u.gsPulseFill.value).mul(select(d.lessThanEqual(r), float(1), float(0))).mul(float(1).sub(d.div(max(r, .01)))));
    m.emissiveNode = materialEmissive.add(vec3(u.gsPulseCol.value).mul(band).mul(live(u.gsPulseA)));
  },
  // looks.js ground(): painted ground in world metres (meadow, fields with hedges, forest floor, rock,
  // trodden earth, river mud, lanes with ruts, puddles), from the land's gsMask and the detail textures
  ground(m, s, o) {
    const u = s.uniforms, L = k => live(u[k]), gA = L('lkGrassA'), gB = L('lkGrassB'), PL = L('lkPlough'), dirt = L('lkDirt');
    const roads = uniformArray(u.lkRoads.value, 'vec4'), rn = L('lkRoadN');
    const fields = (p, dt, dt2, grass) => {
      const A = L('lkFieldAngle'), FS = L('lkFieldSize');
      const f0 = vec2(cos(A).mul(p.x).sub(sin(A).mul(p.y)), sin(A).mul(p.x).add(cos(A).mul(p.y)));
      const fp = vec2(f0.x.add(hash2(vec2(floor(f0.y.div(FS.y)), 3.1)).mul(FS.x)), f0.y);
      const cell = floor(fp.div(FS)), f = fract(fp.div(FS));
      const ns = floor(hash2(cell).mul(3)).add(1), si = floor(f.y.mul(ns)), sf = fract(f.y.mul(ns)), kind = hash2(cell.mul(1.7).add(si.mul(13.3)).add(2));
      const edge = min(min(f.x, f.x.oneMinus()).mul(FS.x), min(sf, sf.oneMinus()).mul(FS.y).div(ns));
      const fz = fp.y.mul(L('lkFurrows')), fur = mix(float(.5), sin(fz).mul(.5).add(.5), clamp(float(1).sub(fwidth(fz).mul(.35)), 0, 1));
      const cA = mix(gA, gB, hash2(cell.add(9))).mul(dt.r.mul(.4).add(.8));
      const cB = L('lkCropA').mul(fur.mul(.26).add(.84).add(dt.r.sub(.5).mul(.25))).mul(hash2(cell.add(2)).mul(.16).add(.92));
      const cC = PL.mul(fur.mul(.55).add(.66)).mul(dt.g.mul(.24).add(.88));
      const cD = mix(PL, gB.mul(1.1), fur.mul(.85)).mul(dt.r.mul(.2).add(.9));
      const cE = L('lkCropB').mul(fur.mul(.2).add(.84).add(dt.g.sub(.5).mul(.2)));
      const c = select(kind.lessThan(.34), cA, select(kind.lessThan(.58), cB, select(kind.lessThan(.72), cC, select(kind.lessThan(.86), cD, cE))));
      const HG = L('lkHedge'), hw = HG.w.add(dt2.a.mul(.7)).mul(step(.22, hash2(cell.add(4.4)))), hedge = float(1).sub(smoothstep(hw.sub(.4), hw.add(.3), edge));
      return mix(mix(c, grass, float(1).sub(smoothstep(hw.add(.3), hw.add(1.7), edge)).mul(.85)), HG.rgb.mul(dt.r.mul(.8).add(.55)), hedge);
    };
    const G = Fn(() => {
      const wp = positionWorld.add(ORG), mask = attribute('gsMask', 'vec4'), sc = L('lkScale'), det = u.lkDetail.value;   // (where it is in the world: origin.js)
      const dt = texture(det, wp.xz.mul(sc.x)), dt2 = texture(det, wp.xz.mul(sc.y).add(.37)), nz = texture(u.lkNoise.value, wp.xz.mul(sc.z));
      const grass = mix(mix(gA, gB, smoothstep(.25, .75, nz.r)), L('lkDry'), smoothstep(.55, .85, nz.g).mul(.65)).mul(dt.r.mul(dt2.a.mul(.6).add(.7)).mul(.5).add(.74));
      const farm = mask.x.mul(smoothstep(.3, .5, nz.b.add(.25)));
      let c = mix(grass, fields(wp.xz, dt, dt2, grass), farm.mul(L('lkFieldsOn')).mul(step(.01, farm))), rough = float(.95);
      c = mix(c, L('lkForest').mul(dt.a.mul(.55).add(.65)).mul(dt.g.mul(.3).add(.85)), mask.y);
      const rk = smoothstep(.35, .7, mask.z.add(dt2.b.sub(.5).mul(.5)));
      c = mix(c, L('lkRock').mul(dt.b.mul(.65).add(.6)), rk); rough = mix(rough, .8, rk);
      c = mix(c, mix(grass, dirt, .75).mul(dt.g.mul(.4).add(.8)), mask.w.mul(smoothstep(.25, .6, dt2.r.add(nz.a.mul(.4)))));
      const B = L('lkBank'), bank = float(1).sub(smoothstep(B.x, B.y, wp.y.add(dt2.r.sub(.5).mul(1.2))));
      c = mix(c, L('lkMud').mul(dt.g.mul(.6).add(.65)), bank); rough = mix(rough, .45, bank.mul(smoothstep(B.z, B.w, wp.y)));
      const rd0 = float(1e4).toVar();
      Loop({ start: int(0), end: int(rn), type: 'int', condition: '<' }, ({ i }) => {
        const sg = roads.element(i), pa = wp.xz.sub(sg.xy), ba = sg.zw.sub(sg.xy), h = clamp(dot(pa, ba).div(max(dot(ba, ba), 1e-6)), 0, 1);
        rd0.assign(min(rd0, length(pa.sub(ba.mul(h)))));
      });
      const R = L('lkRoad'), rd = rd0.add(dt2.g.sub(.5).mul(.9)), road = float(1).sub(smoothstep(R.x, R.y, rd));
      const ruts = float(1).sub(smoothstep(.06, .42, abs(rd.sub(R.z)))), crown = float(1).sub(smoothstep(.2, .55, rd));
      c = mix(c, mix(dirt.mul(dt.g.mul(.38).add(.8)).mul(float(1).sub(ruts.mul(.3))), grass.mul(.85), crown.mul(.6)), road); rough = mix(rough, .88, road);
      const pud = L('lkWet').mul(smoothstep(.62, .7, dt2.a.mul(.6).add(ruts.mul(road).mul(.5)).add(nz.g.mul(.3))));
      return vec4(c.mul(float(1).sub(pud.mul(.45))), mix(rough, .04, pud));
    })().toVar('lkGround');
    afterColor(m, o, () => G.rgb);
    m.roughnessNode = G.a;
  },
  // looks.js hills(): woods, clearings and scree from noise over the hills' own colours
  hills(m, s, o) {
    const u = s.uniforms, sc = live(u.lkHillScale), N = u.lkNoise.value, W = live(u.lkWoods);
    afterColor(m, o, d => {
      const wp = positionWorld.add(ORG), n = texture(N, wp.xz.mul(sc)), mm = texture(N, wp.xz.mul(sc.mul(5.8)).add(.31)), q = texture(N, wp.xz.mul(sc.mul(37)).add(.7));
      const bare = smoothstep(.62, .85, d.b.div(max(d.r, 1e-3))), wood = smoothstep(W.sub(.05), W.add(.05), n.g.mul(.75).add(mm.r.mul(.4))).mul(bare.oneMinus());
      const c = mix(d.mul(mm.b.mul(.4).add(.78)), live(u.lkWood).mul(q.r.mul(.9).add(.55)), wood);
      return c.mul(float(1).sub(bare.mul(.35).mul(smoothstep(.4, .7, q.g))));
    });
  },
  // looks.js rock(): grit and cracks mapped three ways, moss on top
  rock(m, s, o) {
    const u = s.uniforms, D = u.lkDetail.value, k = live(u.lkRockScale);
    afterColor(m, o, c0 => {
      const wp = positionWorld.add(ORG), wn = normalWorld, w0 = pow(abs(wn), vec3(4)), w = w0.div(w0.x.add(w0.y).add(w0.z));
      const d = texture(D, wp.zy.mul(k)).mul(w.x).add(texture(D, wp.xz.mul(k)).mul(w.y)).add(texture(D, wp.xy.mul(k)).mul(w.z));
      const e = texture(D, wp.xz.mul(k.mul(.13)).add(.2));
      const c = c0.mul(d.b.mul(.3).add(d.g.mul(.4)).add(d.a.mul(.3)).mul(.5).add(.66)).mul(e.a.mul(.3).add(.85));
      const moss = smoothstep(.55, .85, wn.y.add(e.r.sub(.5).mul(.6)));
      return mix(c, live(u.lkMoss).mul(d.r.mul(.6).add(.7)), moss.mul(live(u.lkMossy)));
    });
  },
  // looks.js flow(): moving water on a gs.outdoors River (two crossfaded layers sliding at each point's speed)
  flow(m, s, o) {
    const u = s.uniforms, T = live(u.lkFlowT), K = live(u.lkFlowK), F = attribute('lkFlow', 'vec4'), D = attribute('lkDir', 'vec3'), N = u.lkNoise.value;
    const slide = (sc, sx, sy) => {
      const p0 = fract(T.mul(.5)), p1 = fract(T.mul(.5).add(.5)), w = abs(p0.mul(2).sub(1));
      const a = texture(N, vec2(F.x.mul(sx), F.y.mul(sy).sub(F.z.mul(p0).mul(2))).mul(sc));
      const b = texture(N, vec2(F.x.mul(sx), F.y.mul(sy).sub(F.z.mul(p1).mul(2))).mul(sc).add(.37));
      return mix(a, b, w);
    };
    const n = slide(K.x, 1, .6).toVar('lkN'), st = slide(K.x.mul(1.7), 2.5, .25);
    const foam = clamp(smoothstep(.55, .85, st.g.mul(.55).add(F.w.mul(.8)).add(n.r.mul(.25))).mul(K.z), 0, 1).toVar('lkFoam');
    afterColor(m, o, () => mix(mix(live(u.lkDeep), live(u.lkShallow), clamp(D.z.mul(D.z).add(n.a.sub(.5).mul(.4)), 0, 1)).mul(n.r.mul(.3).add(.85)), live(u.lkFoamC), foam));
    m.roughnessNode = mix(float(.06), float(.75), foam);
    const g = vec2(n.b, n.g).sub(.5).mul(K.y).mul(foam.oneMinus()), dd = D.xy, pp = vec2(dd.y.negate(), dd.x), gw = dd.mul(g.y).add(pp.mul(g.x));
    m.normalNode = normalize(normalViewGeometry.add(cameraViewMatrix.mul(vec4(gw.x, 0, gw.y, 0)).xyz));
  },
  // looks.js lava(): glowing cracks between drifting plates of crust, cooling downstream
  lava(m, s, o) {
    const u = s.uniforms, T = live(u.lkFlowT), K = live(u.lkLavaK), F = attribute('lkFlow', 'vec4'), N = u.lkNoise.value, G = live(u.lkGlowC);
    const slide = sc => {
      const p0 = fract(T.mul(.1)), p1 = fract(T.mul(.1).add(.5)), w = abs(p0.mul(2).sub(1));
      return mix(texture(N, vec2(F.x, F.y.sub(F.z.mul(p0).mul(10))).mul(sc)), texture(N, vec2(F.x, F.y.sub(F.z.mul(p1).mul(10))).mul(sc).add(.53)), w);
    };
    const n = slide(K.x).toVar('lkN'), mm = slide(K.x.mul(3.1)).toVar('lkM');
    const heat = clamp(float(1).sub(K.z.mul(F.y).div(max(K.w, 1))), 0, 1).mul(sin(T.mul(1.3).add(n.g.mul(6))).mul(.1).add(.9)).toVar('lkHeat');
    const cr = abs(n.r.sub(.5)).mul(2).add(mm.b.sub(.5).mul(.25)), crack = float(1).sub(smoothstep(.02, heat.mul(.1).add(.05), cr));
    const hot = clamp(crack.add(heat.mul(.2).mul(smoothstep(.55, .9, mm.g))).add(F.w.mul(.5)), 0, 1).toVar('lkHot');
    afterColor(m, o, () => mix(live(u.lkCrust).mul(mm.r.mul(.6).add(.6)), G.mul(.05), hot));
    m.roughnessNode = mix(float(.9), float(.5), hot);
    m.emissiveNode = materialEmissive.add(G.mul(hot).mul(heat).mul(K.y));
  },
  // looks.js leaves(): sway (more towards the top, leaning downwind), light through towards the sun,
  // outlines that hold up far away, and both sides lit alike
  leaves(m, s, o) {
    const u = s.uniforms, t = live(u.lkTime), sw = live(u.lkSway), dir = live(u.lkWindDir);
    const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz.add(ORG), hh = max(positionGeometry.y.sub(sw.y), 0), ph = wp.x.mul(.19).add(wp.z.mul(.23));
    const k = live(u.lkWind).mul(hh).mul(sw.x), kWas = lastFrame(u.lkWind).mul(hh).mul(sw.x), dWas = lastFrame(u.lkWindDir);
    const sway = (t, k, dir) => {
      const swing = vec3(sin(t.mul(1.7).add(ph)).add(sin(t.mul(3.1).add(ph.mul(2.3))).mul(.3)), 0, cos(t.mul(1.3).add(ph.mul(1.4)))).mul(k);
      const lean = dir.mul(k).mul(sin(t.mul(.9).add(ph.mul(.5))).mul(.6).add(1.2));
      return modelWorldMatrixInverse.mul(vec4(swing.add(vec3(lean.x, 0, lean.y)), 0)).xyz;
    };
    // brushed aside by what walks through (looks.js PART_GLSL; only when given a Marks grass field before first drawn)
    const push = partPush(u), pushAt = push ? (sw, wp) => sw.add(modelWorldMatrixInverse.mul(vec4(push(wp, positionGeometry.y), 0)).xyz) : sw => sw;
    // the leaves where they swayed to last frame as well, for the motion three works out (frame generation,
    // SGSR 2): without it every leaf seemed to move by its whole sway each frame, and broke up in made frames
    m.positionNode = Fn(builder => { if (builder.needsPreviousData()) positionPrevious.assign(positionPrevious.add(sway(lastFrame(u.lkTime), kWas, dWas))); return positionLocal.add(pushAt(sway(t, k, dir), wp)); })();
    seeThroughLeaf(m, o, u);
  },
  // looks.js fronds(): long leaves from one point (palms, banana, fern, reeds, ivy, moss, weeds): the tip
  // bounces, flutters and leans downwind most, read from the mesh's lkFrond (where the leaf starts, how far
  // along) and lkFrondId (which leaf, how long); light through, outlines that hold up, both sides lit alike
  fronds(m, s, o) {
    const u = s.uniforms, F = attribute('lkFrond', 'vec4'), FI = attribute('lkFrondId', 'vec2'), a = F.w, push = partPush(u);
    const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz.add(ORG), ph = wp.x.mul(.11).add(wp.z.mul(.13)).add(FI.x.mul(1.93));
    const off = (t, wind, dir) => {
      const k = wind.mul(live(u.lkSway)).mul(FI.y).mul(a).mul(a), lean = dir.mul(k).mul(sin(t.mul(.8).add(ph.mul(.4))).mul(.6).add(1.1));
      const sx = sin(t.mul(1.3).add(ph)).add(sin(t.mul(2.9).add(ph.mul(1.7))).mul(.35)).mul(k).mul(.45), sz = cos(t.mul(1.1).add(ph.mul(1.3))).mul(k).mul(.45);
      const sy = k.negate().mul(sin(t.mul(2.1).add(ph.mul(1.6))).mul(.5).add(sin(t.mul(8.7).add(ph.mul(3.1)).add(a.mul(6))).mul(.12))).sub(length(dir).mul(k).mul(.25));
      let w = vec3(sx.add(lean.x), sy, sz.add(lean.y));
      if (push) w = w.add(push(wp, a.mul(FI.y), smoothstep(1.8, 2.6, positionGeometry.y).oneMinus()));   // (pushed by how far along its leaf, not above a passer-by's reach)
      return modelWorldMatrixInverse.mul(vec4(w, 0)).xyz;
    };
    // (where the leaf was last frame as well, for the motion three works out: see leaves)
    m.positionNode = Fn(builder => { if (builder.needsPreviousData()) positionPrevious.assign(positionPrevious.add(off(lastFrame(u.lkTime), lastFrame(u.lkWind), lastFrame(u.lkWindDir)))); return positionLocal.add(off(live(u.lkTime), live(u.lkWind), live(u.lkWindDir))); })();
    seeThroughLeaf(m, o, u);
  },
  // looks.js meadow(): the blades of land.meadow(): each tuft shrinks into the ground towards the edge of the
  // patch that travels with the camera, bends downwind in rolling gusts, and is lit alike on both sides
  meadow(m, s, o) {
    const u = s.uniforms, K = live(u.lkMeadow), root = attribute('lkRoot', 'vec4').xyz, t = uv().y;
    // (the grass field is read only by blades that were given one before they were first drawn: looks.js meadow().part)
    const part = u.lkPart.value ? c => texture(u.lkPart.value, c).onRenderUpdate(() => u.lkPart.value || BLANK_PART()) : null, PA = part ? live(u.lkPartAt) : null;
    const moved = (p, time, bend, dir) => {
      const far = smoothstep(K.x, K.y, distance(root.xz, cameraPosition.xz.add(ORG.xz))), q = root.add(p.sub(root).mul(far.oneMinus())), hh = q.y.sub(root.y);
      const ph = dot(root.xz, dir).mul(.35).sub(time.mul(2.2)), gust = sin(ph).mul(.3).add(sin(ph.mul(2.7).add(root.z.mul(.9))).mul(.15)).add(.55);
      let b = bend.mul(gust).mul(t).mul(hh), fl = hh.mul(t).mul(.05), at = q;
      if (part) {   // grass that parts (gs.outdoors.Marks): pushed over away from what passes, and lying flat where it was trodden
        const pd = abs(root.xz.sub(PA.xy)), pk = part(root.xz.mul(PA.z)).mul(step(max(pd.x, pd.y), PA.w));
        const ln = pk.rg.mul(2).sub(1.00392).mul(step(.5, pk.a)), dn = min(float(.92), min(float(1), length(ln)).mul(.62).add(pk.b.mul(.9)));
        at = vec3(q.x.add(ln.x.mul(1.1).mul(hh)).add(q.x.sub(root.x).mul(pk.b).mul(1.5)), q.y.sub(hh.mul(dn)), q.z.add(ln.y.mul(1.1).mul(hh)).add(q.z.sub(root.z).mul(pk.b).mul(1.5)));
        b = b.mul(dn.oneMinus()); fl = fl.mul(dn.oneMinus());
      }
      return at.add(vec3(dir.x.mul(b).add(sin(time.mul(3.1).add(p.x.mul(9))).mul(fl)), b.mul(-.35), dir.y.mul(b).add(cos(time.mul(2.6).add(p.z.mul(9))).mul(fl))));
    };
    // (where the blades were last frame as well, for the motion three works out: see leaves)
    m.positionNode = Fn(builder => { if (builder.needsPreviousData()) positionPrevious.assign(moved(positionPrevious, lastFrame(u.lkTime), lastFrame(u.lkBend), lastFrame(u.lkBendDir))); return moved(positionLocal, live(u.lkTime), live(u.lkBend), live(u.lkBendDir)); })();
    // (grass lying flat shows its pale side: a trodden lane reads from above)
    if (part) { const pd = abs(root.xz.sub(PA.xy)), flat = part(root.xz.mul(PA.z)).b.mul(step(max(pd.x, pd.y), PA.w)); afterColor(m, o, c => c.mul(TSL.varying(vec3(1).add(vec3(.34, .3, .12).mul(flat))))); }
    m.normalNode = normalViewGeometry; m.userData.gsBothSides = true;   // (gpuWet: rain and snow lie on a blade's two sides alike, as on WebGL)
  },
};
// hd3d.js AIR_WET: wet, darker, shinier surfaces in the rain (lit standard materials with the air). gsWet is the
// game's own, everywhere; gsWx is the weather's (gs.sky.Weather with a level), only on what the sky can see by the
// cover picture: wet, puddles on flat ground, snow. dry: nothing settles on this one (water, people and animals).
// The puddle and snow amounts come from the surface's own normal, not the bumps on it, so they can flatten the bumps.
// world: is there such a weather on the view now (air.world)? Without one the material gets the game's own wet
// only, which reads no picture at all: nodes have no branch to skip the weather's three reads a pixel with.
let NO_PART = null;
const BLANK_PART = () => NO_PART ||= Object.assign(new DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1), { needsUpdate: true });   // (grass that stands as it grew: a Marks that was taken away)
let BLANK_COVER = null;
const blankCover = () => BLANK_COVER ||= Object.assign(new DataTexture(new Uint16Array([58320]), 1, 1, RedFormat, HalfFloatType), { needsUpdate: true });   // (one spot at -1000 m: all open)
export function gpuWet(m, o, AIR, dry = false, noise = AIR.gsNoise.value, world = true) {
  if (!world) {
    const w = live(AIR.gsWet).mul(live(AIR.gsAirOn)).mul(smoothstep(.15, .85, normalWorld.y).mul(.7).add(.3));
    m.roughnessNode = mix(m.roughnessNode ? float(m.roughnessNode) : materialRoughness, .12, w.mul(.8));
    afterColor(m, o, c => c.mul(float(1).sub(w.mul(.3))));
    return;
  }
  const facing = m.userData.gsBothSides ? n => n : TSL.negateOnBackSide || TSL.directionToFaceDirection;   // (the side of a two-sided thing that is looked at; grass blades are lit alike on both, so snow lies on both)
  const on = live(AIR.gsAirOn), wx = live(AIR.gsWx), at = live(AIR.gsCoverAt), wp = positionWorld.add(ORG), gg = facing(normalWorldGeometry), flat = facing(normalViewGeometry);
  const gp = wp.xz.add(gg.xz.mul(wx.w)), gd = abs(gp.sub(at.xy));
  const top = texture(AIR.gsCover.value || blankCover(), gp.mul(at.z)).onRenderUpdate(() => AIR.gsCover.value || blankCover()).r;
  const open = mix(float(1), smoothstep(-.7, -.25, wp.y.sub(top)), step(max(gd.x, gd.y), at.w).mul(step(1e-6, at.w)));
  const w = max(live(AIR.gsWet), wx.x.mul(open)).mul(on).mul(smoothstep(.15, .85, normalWorld.y).mul(.7).add(.3));
  let rough = mix(m.roughnessNode ? float(m.roughnessNode) : materialRoughness, .12, w.mul(.8));
  if (dry) { m.roughnessNode = rough; afterColor(m, o, c => c.mul(float(1).sub(w.mul(.3)))); return; }
  const n1 = texture(noise, wp.xz.mul(.05)), n2 = texture(noise, wp.xz.mul(.021)).r.mul(.4), pl = mix(float(.86), float(.55), wx.z);
  const p = smoothstep(pl, pl.add(.035), n1.b.mul(.6).add(n2)).mul(smoothstep(.97, .995, gg.y)).mul(open).mul(on).mul(step(1e-6, wx.z));
  const sn = n1.g.mul(.6).add(n2), lim = mix(float(.97), float(.55), wx.y);
  const s = smoothstep(lim, lim.add(.14), gg.y.add(sn.sub(.5).mul(.22))).mul(smoothstep(0, .3, wx.y.mul(1.2).sub(sn.mul(.6)))).mul(open).mul(on).mul(step(1e-6, wx.y));
  rough = mix(mix(rough, .03, p), .85, s);
  m.roughnessNode = rough;
  m.metalnessNode = (m.metalnessNode ? float(m.metalnessNode) : TSL.materialMetalness).mul(s.oneMinus());
  afterColor(m, o, c => mix(c.mul(float(1).sub(w.mul(.3))).mul(float(1).sub(p.mul(.3))), vec3(.86, .9, .96), s));
  m.normalNode = mix(m.normalNode ? vec3(m.normalNode) : TSL.materialNormal, flat, max(p.mul(.92), s.mul(.6))).normalize();
}
// The sun's light on WebGPU: cloud shadows drifting over everything (hd3d.js gsShadeAt) and the near
// shadow cascade's share (CASC_NEAR / CASC_W: the near light inside its box, fading at the edges, the far
// one elsewhere), as the light's colour node. role: a uniform per light, 0 plain, 1 near, 2 far.
const CASC = { m: uniform(new Matrix4()), fade: uniform(.06) };
export function setCascade(near, fade) { if (near) CASC.m.value = near.shadow.matrix; CASC.fade.value = fade; }
// Many lights (three.js's Forward+ clustered lighting): the view is cut into tiles and depth slices and
// each pixel only adds up the point and spot lights that reach it, so a scene can have dozens of lamps
// for about the cost of a few. Lights without shadows only; adding or removing one builds no shaders.
// (three r187: the clustered node passes itself as the light to the lighting model, and the AR floor's
// ShadowMaterial multiplies by its shadowNode, undefined there, so its shader fails: give it "no shadow")
if (ClusteredLightsNode.prototype.shadowNode === undefined) ClusteredLightsNode.prototype.shadowNode = null;
// (three r187: a light keeps the shadow node it made while shadows were on, and a shadow-only material (an
// AR floor, a board game's table) multiplies by it even after the quality tier has switched shadows off,
// when the node gives nothing back: the shader failed with "expected a float" and the floor went dark all
// over. With shadows off the node now answers "no shadow". look-compare's 'shadow-off' scene draws it.)
const shadowSetup = ShadowNode.prototype.setup;
ShadowNode.prototype.setup = function (builder) { return builder.renderer.shadowMap.enabled === false ? float(1) : shadowSetup.call(this, builder); };
// Blend shapes in the motion picture. (three r187 moves a morphing mesh's points by its shapes but leaves
// where they were a frame ago unmoved by them, so the motion picture held each shape's whole offset every
// frame, still or not: fur.js's shells, pushed out along the normal by a shape, said they were sinking back
// into the skin; a face held in a smile said it was going back to rest. SGSR 2, motion blur and frame
// generation all move pixels by that picture: fur and faces swam and smeared, and frame generation's made
// frames were worse there than showing the last frame again: scripts/framegen-test.cjs --kinds shapes.)
// Where a pass writes motion, a frame ago's points now take the shapes too (three's own morph code run
// once more, before the skin's bones, which then move both as before). A shape changing between frames
// (a mouth opening) is not followed as motion: its pixels blend from one frame to the next, as unmarked
// changes do.
const positionSetup = NodeMaterial.prototype.setupPosition;
NodeMaterial.prototype.setupPosition = function (builder) {
  const { object, geometry } = builder;
  if (!geometry?.morphAttributes?.position || !object?.morphTargetInfluences || !builder.needsPreviousData()) return positionSetup.call(this, builder);
  TSL.morphReference(object);
  positionPrevious.assign(positionLocal);
  // the points and normals back as the geometry has them, for three's own pass (setupPosition)
  positionLocal.assign(positionGeometry);
  if (geometry.morphAttributes.normal && geometry.hasAttribute('normal')) TSL.normalLocal.assign(TSL.normalGeometry);
  return positionSetup.call(this, builder);
};
// area lights' LTC tables (hd3d.js panel), once they've loaded
export function areaLTC(lib) { RectAreaLightNode.setLTC(lib.init()); }
// Soft shadows that harden where things touch (hd3d.js sun().softShadows): PCSS (Fernando, NVIDIA 2005)
// as three's own shadow.filterNode hook. A few taps find how far above the ground the blockers are,
// then the filter spreads by that gap times the sun's width: sharp at a foot, soft at a rooftop's edge.
// Sun (orthographic) shadows: depth there is linear, so the gap in metres is the depth gap x range.
const PCSS_FIND = 8, PCSS_TAPS = 12, GOLDEN = 2.39996323;
const disc = (i, n, phi) => { const r = Math.sqrt((i + .5) / n), a = phi.add(i * GOLDEN); return vec2(cos(a), sin(a)).mul(r); };
export function pcss(light) {
  const sh = light.shadow, cam = sh.camera;
  // texels of spread per unit of depth gap: depth range (m) x tan(sun width) / texel size (m)
  const K = uniform(1).onRenderUpdate(() => { const tx = (cam.right - cam.left) / sh.mapSize.x; return (cam.far - cam.near) * Math.tan((light.gsSoft || 2) * Math.PI / 180) / Math.max(1e-4, tx); });
  const TEXEL = uniform(new Vector2()).onRenderUpdate(() => TEXEL.value.set(1 / sh.mapSize.x, 1 / sh.mapSize.y));
  const MAXR = uniform(1).onRenderUpdate(() => Math.min(24, sh.mapSize.x / 64));   // widest spread (texels): ~16 at 1024
  return Fn(({ depthTexture, shadowCoord, depthLayer }, builder) => {
    const rev = builder.renderer.reversedDepthBuffer;
    const at = u => { let t = texture(depthTexture, u); if (depthTexture.isArrayTexture) t = t.depth(depthLayer); return t; };
    // (the raw depth by texel: the map's sampler is a comparing one, which can't read depths)
    const raw = u => { let t = texture(depthTexture).load(ivec2(u.div(TEXEL))); if (depthTexture.isArrayTexture) t = t.depth(depthLayer); return t.x; };
    const texel = TEXEL, z = shadowCoord.z, phi = interleavedGradientNoise(screenCoordinate.xy).mul(6.2831853);
    // 1: blockers in reach of the widest spread, their average depth
    const sum = float(0).toVar(), n = float(0).toVar();
    for (let i = 0; i < PCSS_FIND; i++) {
      const d = raw(clamp(shadowCoord.xy.add(disc(i, PCSS_FIND, phi).mul(MAXR).mul(texel)), 0, .9999));
      const b = rev ? step(z, d) : step(d, z);   // (closer to the sun than this point)
      sum.addAssign(d.mul(b)); n.addAssign(b);
    }
    const lit = float(1).toVar();
    If(n.greaterThan(0), () => {
      const gap = abs(z.sub(sum.div(n))), r = clamp(gap.mul(K), 1, MAXR).mul(texel);
      // 2: the filter, as wide as the gap says
      const acc = float(0).toVar();
      for (let i = 0; i < PCSS_TAPS; i++) acc.addAssign(at(shadowCoord.xy.add(disc(i, PCSS_TAPS, phi.add(1.7)).mul(r))).compare(z));
      lit.assign(acc.div(PCSS_TAPS));
    });
    return lit;
  });
}
// three's clustered lighting keeps one lights node for a scene and fits its grid of cells to the picture of each
// render of that scene that is not inside another one. A shadow map the kit draws itself (shadowOps draw, before
// the frame: three draws its own from inside it) is such a render, so the scene's grid was fitted to the shadow
// map and back again every frame. A map with more cells than the picture had room for (the sun's 2048 map, on
// any phone) made the grid's lists of lamps anew, which gives the scene's lights a new key: every lit shader's
// text written until then was thrown away and written again in the next frames, the ones the background builds
// were for. So a shadow map the kit draws has a lights node of its own (its materials use no lights: nothing is
// made for it), and the scene's grid only ever meets the game's own picture.
// (and a light that a material treats as no other, HDView.faceLight's fill, is lit the usual way: a clustered lamp reaches the lighting
// model as the cluster's node, not as itself)
const NO_WRINKLE = new Vector4();   // (a face at rest, or a mesh with no live face)
class KitClusteredLights extends ClusteredLightsNode { _isClusteredLight(l) { return !l.userData.gsFill && super._isClusteredLight(l); } }
class KitLighting extends ClusteredLighting {
  constructor(...a) { super(...a); this.gsShadowOf = null; this.gsShadowNodes = new WeakMap(); }
  createNode(lights = []) { return new KitClusteredLights(this.maxLights, this.tileSize, this.zSlices, this.maxLightsPerCluster).setLights(lights); }
  getNode(scene) {
    if (scene !== this.gsShadowOf) return super.getNode(scene);
    let n = this.gsShadowNodes.get(scene);
    if (!n) { n = this.createNode(); this.gsShadowNodes.set(scene, n); this._track?.(n); }
    return n;
  }
  /** go(), with every render of scene inside it taken for a shadow map's. */
  shadowDraw(scene, go) { const was = this.gsShadowOf; this.gsShadowOf = scene; try { return go(); } finally { this.gsShadowOf = was; } }
}
export function manyLights(r) { r.lighting = new KitLighting(256, 32, 24, 32); r.gsClustered = true; }
// three's walk of the scene for each render (the picture, each shadow map), made over the scene's list (scene-list.js)
let ListPipeline = null;
export function listWalk(r) { ListPipeline ||= listPipeline({ StandardDrawingPipeline }); r.drawingPipeline = new ListPipeline(); }
/* ---------- sharper textures under SGSR 2 ---------- */
// A scene drawn smaller than the screen reads its textures for the small picture: a mip level too soft
// for the screen SGSR 2 builds it up to. The usual answer (FSR 2 and DLSS ask for it too) is a mip bias
// of log2(drawn width / screen width): textures are read at the level the full-size picture would read,
// and the jitter and the history settle the finer detail. WebGPU samplers have no bias and no shader is
// patched for it: three asks the renderer's context about every texture a material reads at the mesh's
// own uv (TextureNode setup, getTextureGradient), and there the texture's node is given MIP_B as its
// bias (three's own texture().bias(), textureSampleBias in the shader), which costs nothing to sample.
// It reaches colour, normal, roughness, metalness, glow and alpha maps (surface() and the gs.models
// recipes); the kit's materials that read their main textures somewhere else already pass their own
// gradients and scale them by MIP_K, which is the same bias (parallax, recipes laid on by position or
// scattered). The faint detail layers the land and rock looks read by world position are left as they
// are. It is on the renderer's context from the start, so a material keeps one shader wherever it is
// drawn (play, a card picture, a probe), and the bias is 0 whenever SGSR 2 is not upscaling (hd3d.js
// drawGPU sets it per picture).
// Measured on scripts/upscale-compare.cjs's textured scene: 8 to 9% closer to the true picture at 1.5x
// and 10 to 11% at 1.8x, with a little more flicker when nothing moves; half a mip level sharper again
// was closer still with more shimmer, so it stops at the usual value.
// Two things to know. The hook is three's place for handing a texture its uv gradients, and scaling
// those instead was tried first: it was closer still (11 to 13% at 1.5x), because under anisotropic
// filtering it also narrows the footprint, but every texture read then carries explicit gradients, a
// slower kind of read (15 to 20% of a frame in the software renderer on a fully textured scene; Arm's
// advice for Mali phones is to avoid it; not measured on a phone), so the plain bias it is. And three
// has no hook for a bias, so it is handed over for one read: three asks, then reads the node's biasNode
// into this one shader's properties, and that read puts the node back as it was. Nothing stays on the
// node (three shares one node per map name between all materials, and a copy of a node copies its bias),
// and a texture three reads without a sampler is left alone. If a three.js update changes that order no
// bias is read and textures are as drawn, and the comparison's textured runs fail (sharper must stay
// clearly closer), which is the tripwire for it.
// (in three's per-render group: a plain material that hasn't changed only has its shared uniforms sent again)
const MIP_K = uniform(1).setGroup(TSL.renderGroup), MIP_B = uniform(0).setGroup(TSL.renderGroup);
/** The mip bias for what is drawn next, as a scale: drawn width / screen width under SGSR 2, else 1. */
export const mipScale = k => { MIP_K.value = k; MIP_B.value = Math.log2(k); };
export function sharpMips(r) {
  const put = (node, value) => Object.defineProperty(node, 'biasNode', { value, writable: true, enumerable: true, configurable: true });
  const once = { configurable: true, enumerable: true, get() { put(this, null); return MIP_B; }, set(v) { put(this, v); } };
  r.contextNode.value.getTextureGradient = (node, builder) => {
    const t = node.value;
    // (builder.isUnfilterable: textures three reads without a sampler, nearest-filtered ones among them, can't take a bias)
    if (builder.shaderStage === 'fragment' && node.type === 'TextureNode' && t?.isTexture && !t.isRenderTargetTexture && !t.isDepthTexture && builder.isUnfilterable?.(t) === false) Object.defineProperty(node, 'biasNode', once);
    return null;   // (no gradients of ours: three samples with its own)
  };
}
// Auto exposure's light meter (hd3d.js Eye): the scene's brightness as 16 x 16 log values (each from a
// 4 x 4 grid of taps), packed into bytes so any phone can read them back without stalling.
export function eyeMeter(r) {
  const src = texture(new Texture()), mat = new NodeMaterial(), rt = new RenderTarget(16, 16, { depthBuffer: false });
  mat.fragmentNode = Fn(() => {
    const q = uv(), sum = float(0).toVar();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const c = src.sample(q.add(vec2((x - 1.5) / 64, (y - 1.5) / 64))).rgb;
      sum.addAssign(log2(max(dot(c, vec3(.2126, .7152, .0722)), 1e-4)));
    }
    const n = clamp(sum.div(16).add(14).div(20), 0, 1).mul(255);
    return vec4(floor(n).div(255), fract(n), 0, 1);
  })();
  const quad = new QuadMesh(mat);
  return {
    async read(tex) {
      src.value = tex; const was = r.getRenderTarget();
      r.setRenderTarget(rt); quad.render(r); r.setRenderTarget(was);
      return r.readRenderTargetPixelsAsync(rt, 0, 0, 16, 16);
    },
  };
}
// Occlusion culling's depth meter (occlude.js; the WebGL one is its DepthMeter): the frame's depth boiled
// down to a small picture and read back without waiting for it. Each texel is the FARTHEST depth of its
// block of the frame as three bytes (rounded up) and how much nearer the block's nearest is as a fourth
// (occlusion.js depth() says how). job: what occludeFrame() gave, with pad (pixels a block is widened by
// all round: 1 when the frame is drawn a fraction of a pixel off or with several samples a pixel);
// done(job, px): called when the picture is back, top row first.
// Its shader is one per renderer for each kind of depth picture (three writes another for a multisampled
// one), shared by every chain the renderer has: a chain made again (another quality tier, the upscaler
// coming on) gives the meter a new depth picture of the same kind, and the meter only points at it. Each
// kind's shader and pipeline are made in the frame a chain first has its depth picture (warm), which is
// under the loading screen when a round starts: made in the frame occlusion first woke (often a few
// seconds into a round), they held that frame 1 to 43 ms on the test machine writing the shader, and the
// pipeline was made on the spot. (Built in the background with compileAsync instead, three keyed that
// build differently from the meter's own draws, another lights node among other things, and made it again.)
const METER = new WeakMap();
const depthKind = (r, tex) => { let n = 1; try { n = r.backend.utils.getTextureSampleData(tex).primarySamples; } catch (e) { /* three's own default */ } return `${tex.type}|${tex.format}|${tex.minFilter}|${tex.magFilter}|${n}`; };
export function depthMeter(r) {
  const S = METER.get(r) || (METER.set(r, { U: { blk: uniform(new Vector2(1, 1)), pk: uniform(new Vector2()), size: uniform(new Vector2(1, 1)), pad: uniform(0) }, kinds: new Map() }), METER.get(r));
  const U = S.U;
  let rt = null, flying = 0; const pool = [], pix = [];
  const make = tex => {
    const mat = new NodeMaterial(), dT = texture(tex);
    mat.name = 'Depth meter';
    mat.fragmentNode = Fn(() => {
      const t = floor(screenCoordinate.xy), pad = int(U.pad), top = ivec2(U.size).sub(1);
      const lo = max(ivec2(floor(t.mul(U.blk))).sub(pad), ivec2(0)).toVar(), hi = min(ivec2(TSL.ceil(t.add(1).mul(U.blk))).sub(1).add(pad), top).toVar();
      const far = float(0).toVar(), near = float(1).toVar();
      Loop({ start: lo.y, end: hi.y, condition: '<=' }, { start: lo.x, end: hi.x, condition: '<=' }, ({ i, j }) => {
        const d = dT.load(ivec2(j, i)).r; far.assign(max(far, d)); near.assign(min(near, d));
      });
      const none = far.greaterThanEqual(1);
      const q = select(none, float(16777215), min(float(16777214), TSL.ceil(far.mul(16777215)).add(1))).toVar();
      const D = U.pk.y.div(far.add(U.pk.x)), N = U.pk.y.div(near.add(U.pk.x));   // (how far each is: WebGPU's depth runs 0..1)
      const a = select(none, float(0), min(float(255), TSL.ceil(sqrt(max(float(0), float(1).sub(N.div(D)))).mul(255))));
      const b0 = floor(q.div(65536)).toVar(), rem = q.sub(b0.mul(65536)).toVar(), b1 = floor(rem.div(256)).toVar();
      return vec4(b0, b1, rem.sub(b1.mul(256)), a).div(255);
    })();
    return { mat, dT, quad: new QuadMesh(mat) };
  };
  // the shader for this kind of depth picture, pointed at tex (made the first time: warm)
  const kindOf = tex => {
    const k = depthKind(r, tex); let K = S.kinds.get(k);
    if (!K) S.kinds.set(k, K = make(tex));
    if (K.dT.value !== tex) K.dT.value = tex;
    return K;
  };
  return {
    /**
     * Makes the shader and pipeline for this kind of depth picture, if they aren't made, by drawing the meter
     * once into a picture of 4 x 4 (the same kind of picture as its own, so three keeps the same build for it).
     * Called in the frame a chain is made, which builds the chain's own shaders anyway.
     */
    warm(tex) {
      if (!tex || !r.backend?.device || r.reversedDepthBuffer) return;
      const k = depthKind(r, tex); if (S.kinds.has(k)) return;
      const K = kindOf(tex), at = S.at ||= new RenderTarget(4, 4, { depthBuffer: false });
      U.blk.value.set(1, 1); U.size.value.set(1, 1); U.pk.value.set(1, 1); U.pad.value = 0;
      const was = r.getRenderTarget(); r.setRenderTarget(at); try { K.quad.render(r); } finally { r.setRenderTarget(was); }
    },
    /** Takes the picture of the depth just drawn (tex: the scene pass's depth texture). False when it could not. */
    read(tex, job, done) {
      const device = r.backend?.device; if (!tex || !device || flying >= 2 || r.reversedDepthBuffer) return false;
      const K = kindOf(tex);
      const { w, h } = job;
      if (!rt || rt.width !== w || rt.height !== h) { rt?.dispose(); rt = new RenderTarget(w, h, { depthBuffer: false }); }
      U.blk.value.set(job.tag.W / w, job.tag.H / h); U.size.value.set(job.tag.W, job.tag.H); U.pk.value.set(job.tag.p10, job.tag.p14); U.pad.value = job.pad | 0;
      const was = r.getRenderTarget(); r.setRenderTarget(rt); K.quad.render(r); r.setRenderTarget(was);
      const gpuTex = r.backend.get(rt.texture)?.texture; if (!gpuTex) return false;
      // (three's own read makes a buffer on the chip for every read: these are kept and used again)
      const row = w * 4, bpr = Math.ceil(row / 256) * 256, size = bpr * h;
      let buf = null; while (pool.length && !buf) { const b = pool.pop(); if (b.size === size) buf = b; else b.destroy(); }
      buf ||= device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = device.createCommandEncoder(); enc.copyTextureToBuffer({ texture: gpuTex }, { buffer: buf, bytesPerRow: bpr }, { width: w, height: h });
      device.queue.submit([enc.finish()]); flying++;
      buf.mapAsync(GPUMapMode.READ).then(() => {
        const src = new Uint8Array(buf.getMappedRange()); let px = pix.pop(); if (!px || px.length !== row * h) px = new Uint8Array(row * h);
        if (bpr === row) px.set(src.subarray(0, row * h)); else for (let y = 0; y < h; y++) px.set(src.subarray(y * bpr, y * bpr + row), y * row);
        buf.unmap(); pool.push(buf);
        try { done(job, px); } finally { pix.push(px); }
      }, () => { try { buf.destroy(); } catch (e) { /* gone with its device */ } }).finally(() => { flying--; });
      return true;
    },
    // (the shaders stay with the renderer, for the chains that come after this one)
    dispose() { rt?.dispose(); for (const b of pool) b.destroy(); pool.length = 0; },
  };
}
// The still/moving shadow split on WebGPU (hd3d.js shadowLights): the light gets three's own shadow
// node, made here so the kit can draw its map when it wants to (shadowOps draw), and over what is already
// there when told to keep it (three clears a shadow map each time it draws one).
export function splitShadowNode(l) {
  const node = shadowOf(l, l.shadow), base = node.renderShadow, update = node.updateShadow;
  node.gsSplit = true;
  node.renderShadow = function (frame) {
    const r = frame.renderer;
    if (this.gsKeep) r.autoClear = false;
    if (!this.gsPart) return base.call(this, frame);
    // (a part of the map: three's own step would set the map's viewport back to the whole of it)
    const { shadow, light } = this, scene = frame.scene, name = scene.name;
    shadow.updateMatrices(light);
    scene.name = 'Shadow Map [ part ]'; try { r.render(scene, shadow.camera); } finally { scene.name = name; }
  };
  // (HD.info: what the shadow maps cost this frame, as on WebGL)
  node.updateShadow = function (frame) {
    const I = frame.renderer.info.render, t0 = I.triangles, c0 = I.drawCalls;
    try { return update.call(this, frame); } finally { SHADOW_COST[0] += I.triangles - t0; SHADOW_COST[1] += I.drawCalls - c0; }
  };
  return node;
}
/** Triangles and draws the shadow maps have taken since it was last emptied (hd3d.js empties it each frame). */
export const SHADOW_COST = [0, 0];
// What hd3d.js shadowSplit and shadowTiles ask of a backend (the WebGL ones are in splitShadowsGL). A part
// of a map is [x, y, w, h] in tiles of px texels, x to the light's right and y up: the light's camera looks
// at that part alone (a view offset), so only what is in it is drawn, into that part of the map.
const aheadDone = new WeakSet();
export function shadowOps(r) {
  let blit = null;
  const ops = {
    scene: null, camera: null,
    draw(l, mask, keep, q, px) {
      const sh = l.shadow, node = sh.shadowNode, c = sh.camera, m0 = c.layers.mask, map = node.shadowMap, N = map.width;
      if (q) {
        if (!keep) (blit ||= shadowBlit(r)).wipe(map, q, px);   // (WebGPU clears a whole picture or none of it: the part is emptied by drawing "far" over it)
        const x = q[0] * px, w = q[2] * px, h = q[3] * px, y = N - q[1] * px - h;
        c.setViewOffset(N, N, x, y, w, h); map.viewport.set(x, y, w, h); map.scissor.set(x, y, w, h); map.scissorTest = true;
      }
      c.layers.mask = mask; node.gsKeep = keep || !!q; node.gsPart = !!q;
      const go = () => node.updateShadow({ renderer: r, scene: ops.scene, camera: ops.camera });
      try { if (r.lighting?.shadowDraw) r.lighting.shadowDraw(ops.scene, go); else go(); }
      finally { c.layers.mask = m0; node.gsKeep = node.gsPart = false; if (q) { c.clearViewOffset(); map.viewport.set(0, 0, N, N); map.scissor.set(0, 0, N, N); map.scissorTest = false; sh.updateMatrices(l); } }
    },
    copy(l, from, to, qs, px) { if (qs) (blit ||= shadowBlit(r)).copy(from.depthTexture, to, qs, px); else r.copyTextureToTexture(from.depthTexture, to.depthTexture); },
    shift(l, from, to, dx, dy, dz) { (blit ||= shadowBlit(r)).shift(from.depthTexture, to, dx, dy, dz); },
    // the copies' shaders, built when the kept copy is made (a frame that is building shaders anyway) and not in
    // the frame the sun first steps a tile, which stopped for the three of them
    warm(l, map, cache) { (blit ||= shadowBlit(r)).warm(map, cache); },
    // ...and before that, the first frames a sun that could go into tiles has its map (under the loading screen
    // when a round starts), on stand-ins of 4 x 4 of the same kinds as its map and its kept copy: a sun went into
    // tiles once enough still things were in its view, often seconds into a round, and that frame made the
    // three pipelines then and there. The real copies then take over those materials (shadowBlit matFor).
    ahead(l) { const map = l.shadow.map; if (map && !aheadDone.has(map)) { aheadDone.add(map); (blit ||= shadowBlit(r)).ahead(map); } },
    make(l) {
      const w = l.shadow.mapSize.x, h = l.shadow.mapSize.y, t = new RenderTarget(w, h, { depthBuffer: true }), was = r.getRenderTarget(); t.depthTexture = new DepthTexture(w, h); r.initRenderTarget(t);
      // (three empties a picture's depth the first time something is drawn into it without a clear: so it is emptied here, before anything is kept in it, and not under a part written into it later)
      r.setRenderTarget(t); r.clearDepth(); r.setRenderTarget(was);
      return t;
    },
  };
  return ops;
}
// Parts of one depth picture written into another (WebGPU copies a depth picture whole or not at all): the
// parts are drawn as rectangles whose every texel takes its depth from the other picture, from off texels
// away and dz deeper (what comes from outside it, or ends up outside the depth range, is "far": nothing there).
function shadowBlit(r) {
  const U = { off: uniform(new Vector2()), dz: uniform(0), top: uniform(1) }, MAX = 64;
  const pos = new Float32Array(MAX * 18), geo = new BufferGeometry(), at = new BufferAttribute(pos, 3); geo.setAttribute('position', at);
  const mesh = new Mesh(geo, null), cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1), mats = new WeakMap(); mesh.frustumCulled = false;
  const finish = m => { m.name = 'Shadow map copy'; m.vertexNode = vec4(positionGeometry.xy, 0, 1); m.fragmentNode = vec4(0); m.colorWrite = false; m.depthTest = true; m.depthFunc = AlwaysDepth; m.depthWrite = true; m.fog = false; m.lights = false; return m; };
  let far = null;
  const warmed = new WeakMap(), NONE = [[0, 0, 0, 0]], farMat = () => { if (!far) { far = new NodeMaterial(); far.depthNode = float(1); finish(far); } return far; };
  // materials made ahead for stand-ins (ahead), by the kind of depth picture they read: a real picture of that
  // kind takes one over (pointed at it) and its shader and pipeline are already made
  const spares = new Map(), kindOf = t => `${t.type}|${t.format}|${t.compareFunction}|${t.minFilter}|${t.magFilter}`;
  const matFor = (tex, spare = false) => {
    let m = mats.get(tex); if (m) return m;
    const sp = !spare && spares.get(kindOf(tex))?.pop();
    if (sp) { sp.gsSrc.value = tex; mats.set(tex, sp); return sp; }
    m = new NodeMaterial(); const dT = texture(tex); m.gsSrc = dT;
    m.depthNode = Fn(() => {
      const p = ivec2(floor(screenCoordinate.xy)).add(ivec2(U.off)).toVar(), top = int(U.top);
      const inside = p.x.greaterThanEqual(0).and(p.x.lessThanEqual(top)).and(p.y.greaterThanEqual(0)).and(p.y.lessThanEqual(top));
      const d = dT.load(clamp(p, ivec2(0), ivec2(top))).r.toVar(), moved = d.add(U.dz);
      return select(inside.and(d.lessThan(1)).and(moved.greaterThanEqual(0)).and(moved.lessThan(1)), moved, float(1));
    })();
    finish(m);
    if (spare) { const k = kindOf(tex); (spares.get(k) || spares.set(k, []).get(k)).push(m); } else mats.set(tex, m);
    return m;
  };
  // the rectangles (texels, y up) as triangles in clip space
  const quads = (qs, px, N) => {
    const n = Math.min(MAX, qs.length);
    for (let i = 0; i < n; i++) {
      const q = qs[i], x0 = q[0] * px / N * 2 - 1, y0 = q[1] * px / N * 2 - 1, x1 = (q[0] + q[2]) * px / N * 2 - 1, y1 = (q[1] + q[3]) * px / N * 2 - 1, o = i * 18;
      pos[o] = x0; pos[o + 1] = y0; pos[o + 3] = x1; pos[o + 4] = y0; pos[o + 6] = x1; pos[o + 7] = y1;
      pos[o + 9] = x0; pos[o + 10] = y0; pos[o + 12] = x1; pos[o + 13] = y1; pos[o + 15] = x0; pos[o + 16] = y1;
    }
    at.needsUpdate = true; geo.setDrawRange(0, n * 6);
  };
  const ALL = [[0, 0, 1, 1]];
  const run = (m, to) => {
    const was = r.getRenderTarget(), ac = r.autoClear, st = to.scissorTest; mesh.material = m;
    r.autoClear = false; to.scissorTest = false; r.setRenderTarget(to);
    try { r.render(mesh, cam); } finally { r.setRenderTarget(was); r.autoClear = ac; to.scissorTest = st; }
  };
  return {
    copy(tex, to, qs, px) { U.off.value.set(0, 0); U.dz.value = 0; U.top.value = to.width - 1; quads(qs, px, to.width); run(matFor(tex), to); },
    shift(tex, to, dx, dy, dz) { U.off.value.set(dx, -dy); U.dz.value = dz; U.top.value = to.width - 1; quads(ALL, to.width, to.width); run(matFor(tex), to); },
    wipe(to, q, px) { ALL2[0] = q; quads(ALL2, px, to.width); run(farMat(), to); },
    // each of the three drawn once with a rectangle of no size: nothing is written, the shaders and pipelines are made
    warm(map, cache) {
      if (warmed.get(cache) === map) return; warmed.set(cache, map);
      U.off.value.set(0, 0); U.dz.value = 0; U.top.value = map.width - 1; quads(NONE, 1, map.width);
      run(matFor(map.depthTexture), cache); run(matFor(cache.depthTexture), map); run(farMat(), map);
    },
    // the same three on stand-ins like a sun's map and the copy its tiles would keep (shadowOps make), kept for
    // the real ones (their pictures stay, 4 x 4: three keeps a pipeline while what was drawn with it is there).
    // The map's depth is read with either filter: three sets it again each time it builds a shader that takes
    // the shadow (ShadowNode setupShadow: linear for PCF where the chip compares, else nearest), and a
    // material made for the other one is a shader of its own.
    ahead(map) {
      const d = map.depthTexture; if (!d) return;
      const like = f => {
        const t = new RenderTarget(4, 4, { depthBuffer: true, stencilBuffer: map.stencilBuffer, samples: map.samples });
        t.texture.type = map.texture.type; t.texture.format = map.texture.format;
        const z = t.depthTexture = new DepthTexture(4, 4, d.type); z.format = d.format; z.compareFunction = d.compareFunction; z.minFilter = z.magFilter = f;
        r.initRenderTarget(t); return t;
      };
      const lin = like(LinearFilter), near = like(NearestFilter);
      const copy = new RenderTarget(4, 4, { depthBuffer: true }); copy.depthTexture = new DepthTexture(4, 4); r.initRenderTarget(copy);   // (as shadowOps make)
      U.off.value.set(0, 0); U.dz.value = 0; U.top.value = 3; quads(NONE, 1, 4);
      run(matFor(lin.depthTexture, true), copy); run(matFor(near.depthTexture, true), copy); run(matFor(copy.depthTexture, true), lin); run(farMat(), lin);
      (this.stand ||= []).push(lin, near, copy);
    },
  };
}
const ALL2 = [null];


/* ---------- gs.models material recipes on WebGPU (materials.js) ---------- */
const { sRGBTransferEOTF, positionWorld: PW, normalWorld: NW, faceDirection, positionView, cross } = TSL;
// a height's slope turned into a bent normal (Mikkelsen's surface gradient, as three's bump map does), from n
const bumpN = (h, k, n) => {
  const dpx = dFdx(positionView), dpy = dFdy(positionView), r1 = cross(dpy, n), r2 = cross(n, dpx), det = dot(dpx, r1).mul(faceDirection);
  const g = TSL.sign(det).mul(dFdx(h).mul(k).mul(r1).add(dFdy(h).mul(k).mul(r2)));
  return normalize(abs(det).mul(n).sub(g));
};
const hash21 = q => fract(sin(dot(q, vec2(127.1, 311.7))).mul(43758.5453));
// the close-up look's share of a pixel by the baked texels it covers: all of it up to half a texel, none from one texel
const NEAR_FADE = [.5, 1];
function recipeTwin(gm) {
  const R = gm.userData.recipe, REC = RECIPES[R.name], Cls = gm.isMeshPhysicalMaterial ? MeshPhysicalNodeMaterial : MeshStandardNodeMaterial;
  const copy = () => { const m = new Cls(); for (const k in gm) if (k !== 'uuid' && k !== 'id' && k !== 'type') m[k] = gm[k]; return m; };
  const rp = gm.map.repeat, solidK = R.solid ? (typeof R.solid === 'number' ? R.solid : 2) : 0, plain = !solidK && !R.scatter;
  const ax = abs(NW), useX = ax.x.greaterThan(ax.y).and(ax.x.greaterThan(ax.z)), useY = ax.y.greaterThan(ax.z);
  const PT = PW.add(ORG), q = solidK ? select(useX, PT.zy, select(useY, PT.xz, PT.xy)).div(solidK) : uv().mul(vec2(rp.x, rp.y));   // where in the tiles
  // far: the baked textures; scatter: four neighbouring tiles each moved by a random amount, blended
  const far = copy();
  const gx = dFdx(q).mul(MIP_K), gy = dFdy(q).mul(MIP_K), read = (t, qq) => texture(t, qq).grad(gx, gy);
  const c = floor(q.sub(.5)), f = q.sub(.5).sub(c), sw = f.mul(f).mul(f.mul(-2).add(3));
  const moved = (dx, dy) => q.add(vec2(hash21(c.add(vec2(dx, dy))), hash21(c.add(vec2(dx, dy)).add(17.3))));
  const four = at => mix(mix(at(0, 0), at(1, 0), sw.x), mix(at(0, 1), at(1, 1), sw.x), sw.y);
  const look = t => (R.scatter ? four((dx, dy) => read(t, moved(dx, dy))) : read(t, q));
  // (laid on by position or scattered: the kit reads the textures; by the mesh's UVs three reads them itself)
  const B = plain ? null : { col: look(gm.map), rough: look(gm.roughnessMap).g, metal: gm.metalnessMap ? look(gm.metalnessMap).b : float(1),
    n: bumpN(look(gm.userData.recipeHeight || gm.map).r, gm.normalScale.x * .06 * (solidK || 1), TSL.normalView) };
  if (B) {
    far.colorNode = B.col.mul(materialColor);
    far.roughnessNode = B.rough.mul(materialRoughness);
    if (gm.metalnessMap) far.metalnessNode = B.metal.mul(TSL.materialMetalness);
    far.normalNode = B.n;
    far.map = far.roughnessMap = far.metalnessMap = far.normalMap = null;
  }
  far.name = (gm.name || 'recipe') + ':far';
  if (!R.closeUp) return far;
  // near: the recipe itself at this pixel (sharp however close), its height bending the normal. Worked out
  // at one point of the pixel, it has no filtering: where the baked textures already have a texel or more
  // for every pixel of the screen it would only alias (thin lines far off crawl as the picture moves), so
  // each pixel fades to the baked look by how many texels it covers, and the recipe is left with the
  // pixels the textures are stretched over. A floor the camera stands on is close-up at its feet and
  // baked further off. The recipe is read where the textures were painted from (the same tile, and with
  // scatter the same four moved tiles), so the two looks lie on top of each other where they fade.
  const near = copy(), O = seeded(tslOps(TSL), R.seed), K = {}; for (const k in R.look) K[k] = O.rgb(R.look[k]);
  const num = v => (typeof v === 'number' ? float(v) : v), ref = TSL.materialReference;
  // (painted from the top row down, and a texture's v runs up: the recipe's y is turned over)
  const rec = qq => { const t = fract(qq); return REC.f(O, vec2(t.x, t.y.oneMinus()).mul(REC.P), K); };
  const recs = R.scatter ? [rec(moved(0, 0)), rec(moved(1, 0)), rec(moved(0, 1)), rec(moved(1, 1))] : [rec(q)];
  const part = k => (R.scatter ? four((dx, dy) => num(recs[dx + dy * 2][k])) : num(recs[0][k]));
  // baked texels to a pixel of the screen, along the way the tiles are squeezed most (under SGSR 2: of the picture it builds)
  const per = max(length(dFdx(q)), length(dFdy(q))).mul(MIP_K).mul(gm.map.image?.width || 256), w = smoothstep(NEAR_FADE[0], NEAR_FADE[1], per).oneMinus();
  const col = sRGBTransferEOTF(part('col')), rough = part('rough').clamp(0, 1), metal = part('metal').clamp(0, 1);
  const bent = bumpN(part('h'), gm.normalScale.x * .05 * (solidK || 1 / Math.max(rp.x, rp.y)) * REC.P / 4, TSL.normalView);
  // (the colour's alpha is a plain 1, as it was: three reads it for the shadow pass, which then drops the rest)
  if (B) {
    near.colorNode = vec4(mix(B.col.rgb, col, w), 1).mul(materialColor);
    near.roughnessNode = mix(B.rough, rough, w).mul(materialRoughness);
    near.metalnessNode = mix(B.metal, metal, w).mul(TSL.materialMetalness);
    near.normalNode = normalize(mix(B.n, bent, w));
    near.map = near.roughnessMap = near.metalnessMap = near.normalMap = null;
  } else {
    // the maps stay on: three's own reads of them are the baked look, and the recipe takes the material's
    // plain numbers (from this material by name: three also builds the colour for the shadow pass's material)
    near.colorNode = vec4(mix(materialColor.rgb, col.mul(ref('color', 'color', near)), w), 1);
    near.roughnessNode = mix(materialRoughness, rough.mul(ref('roughness', 'float', near)), w);
    near.metalnessNode = mix(TSL.materialMetalness, metal.mul(ref('metalness', 'float', near)), w);
    near.normalNode = normalize(mix(TSL.materialNormal, bent, w));
  }
  near.name = (gm.name || 'recipe') + ':near';
  far.userData.gsNear = near; far.userData.gsNearDist = 4;
  return far;
}
/* ---------- froxel fog (hd3d.js v.fog3d) ---------- */
// Fog lit by the sun through its shadows and by the lamps nearby, in a grid of small boxes fitted to
// the view (froxels: 64 x 36 across the screen, 48 deep, deeper slices further away), as Frostbite and
// Unreal do. One compute pass walks each column from the eye outwards, adding up the light the fog
// sends back and how much it lets through; every material then reads the grid at its own place
// (scene.fogNode), so see-through things are fogged right too. Built on three's compute + 3D textures.
const FX = 64, FY = 36, FZ = 48, FLAMPS = 8;
export function froxels() {
  const grid = new Storage3DTexture(FX, FY, FZ); grid.type = HalfFloatType; grid.magFilter = grid.minFilter = LinearFilter; grid.generateMipmaps = false;
  const U = {
    invVP: uniform(new Matrix4()), VP: uniform(new Matrix4()), cam: uniform(new Vector3()), nf: uniform(new Vector2(.5, 60)),
    dens: uniform(new Vector4(.03, 0, .15, .5)),   // density per metre, fog floor y, falloff per metre above it, noise
    drift: uniform(new Vector3()), col: uniform(new Color()), amb: uniform(new Color()), sunDir: uniform(new Vector3(0, 1, 0)), sunCol: uniform(new Color()),
    g: uniform(.4), shM: uniform(new Matrix4()), shOn: uniform(0), shSize: uniform(new Vector2(1, 1)),
    lPos: uniformArray(Array.from({ length: FLAMPS }, () => new Vector4()), 'vec4'), lCol: uniformArray(Array.from({ length: FLAMPS }, () => new Vector4()), 'vec4'), nl: uniform(0),
  };
  const shT = texture(NO_SHADOW);
  // slice edges: exponential in distance from the eye, near to far
  const sliceAt = k => U.nf.x.mul(pow(U.nf.y.div(U.nf.x), k.div(FZ)));
  const hg = c => U.g.mul(U.g).oneMinus().div(pow(U.g.mul(U.g).add(1).sub(U.g.mul(2).mul(c)), 1.5)).mul(1 / (4 * Math.PI));
  const compute = Fn(() => {
    const x = instanceIndex.mod(FX), y = instanceIndex.div(FX), q = vec2(float(x).add(.5).div(FX), float(y).add(.5).div(FY));
    const w4 = U.invVP.mul(vec4(q.mul(2).sub(1), .5, 1)), rd = normalize(w4.xyz.div(w4.w).sub(U.cam)).toConst();
    const sunPh = hg(dot(rd, U.sunDir)).toConst();
    const acc = vec3(0).toVar(), T = float(1).toVar();
    Loop({ start: 0, end: FZ }, ({ i }) => {
      const t0 = sliceAt(float(i)), t1 = sliceAt(float(i).add(1)), len = t1.sub(t0), p = U.cam.add(rd.mul(t0.add(t1).mul(.5))).toConst();
      // how thick the fog is here: thinning with height above its floor, and patchy, drifting with the wind
      const n = mx_noise_float(p.add(ORG).mul(.12).add(U.drift)).mul(.5).add(.5);
      const d = U.dens.x.mul(exp(max(p.y.sub(U.dens.y), 0).mul(U.dens.z).negate())).mul(mix(float(1), n.mul(1.8), U.dens.w)).toConst();
      // the sun, through its shadow map (read by texel: nearest is plenty at froxel size)
      const s4 = U.shM.mul(vec4(p, 1)), sc = s4.xyz.div(s4.w);
      const inside = U.shOn.greaterThan(.5).and(sc.x.greaterThan(0)).and(sc.x.lessThan(1)).and(sc.y.greaterThan(0)).and(sc.y.lessThan(1)).and(sc.z.lessThan(1));
      const sd = shT.load(ivec2(vec2(sc.x, sc.y.oneMinus()).mul(U.shSize))).x;
      const lit = select(inside, step(sc.z, sd), float(1));
      const L = vec3(U.sunCol).mul(lit.mul(sunPh)).add(U.amb).toVar();
      // lamps: soft round falloff to their range, scattered evenly
      Loop({ start: 0, end: FLAMPS }, ({ i: j }) => {
        If(float(j).greaterThanEqual(U.nl), () => { Break(); });
        const lp = U.lPos.element(j), lc = U.lCol.element(j), v = lp.xyz.sub(p), dd = dot(v, v), r2 = lp.w.mul(lp.w);
        const f = clamp(dd.div(r2).oneMinus(), 0, 1);
        L.addAssign(lc.xyz.mul(f.mul(f)).div(dd.add(1)).mul(1 / (4 * Math.PI)));
      });
      // add up (energy-conserving over the slice, as Frostbite): light sent back, and what gets through
      const S = L.mul(U.col).mul(d), tr = exp(d.mul(len).negate());
      acc.addAssign(T.mul(S.sub(S.mul(tr)).div(max(d, 1e-5))));
      T.mulAssign(tr);
      textureStore(grid, uvec3(x, y, i), vec4(acc, T)).toWriteOnly();
    });
  })().compute(FX * FY, [64]);
  // every material: its colour seen through the fog in front of it
  const nodes = new Map();
  const node = (inner = null) => {
    let n = nodes.get(inner); if (n) return n;
    n = Fn(() => {
      const base = inner ? vec4(inner) : output;
      const c4 = U.VP.mul(vec4(positionWorld, 1)), q = c4.xy.div(c4.w).mul(.5).add(.5);
      const t = length(positionWorld.sub(U.cam)), k = log2(max(t, U.nf.x).div(U.nf.x)).div(log2(U.nf.y.div(U.nf.x))).mul(FZ);
      const f = texture3D(grid, vec3(q, clamp(k.sub(.5).div(FZ), .5 / FZ, 1 - .5 / FZ)));
      // nearer than the first slice's middle: fade in from nothing
      const a = clamp(k.mul(2), 0, 1);
      return vec4(base.rgb.mul(mix(float(1), f.a, a)).add(f.rgb.mul(a)), base.a);
    })();
    nodes.set(inner, n); return n;
  };
  const PV = new Matrix4();
  return {
    U, node,
    update(r, cam, o) {
      cam.updateMatrixWorld(); PV.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      U.VP.value.copy(PV); U.invVP.value.copy(PV).invert(); cam.getWorldPosition(U.cam.value);
      U.nf.value.set(Math.max(.1, o.near), o.far); U.dens.value.set(o.density, o.height, o.falloff, o.noise);
      U.drift.value.set(o.wind[0] * o.t * .12, o.t * .02, o.wind[1] * o.t * .12); U.col.value.copy(o.colour); U.amb.value.copy(o.ambient);
      U.g.value = o.g; U.sunDir.value.copy(o.sunDir); U.sunCol.value.copy(o.sunCol);
      const sm = o.shadow; U.shOn.value = sm ? 1 : 0; shT.value = sm || NO_SHADOW; if (sm) { U.shM.value.copy(o.shadowM); U.shSize.value.set(sm.image.width, sm.image.height); }
      const ls = o.lamps; U.nl.value = ls.length;
      for (let i = 0; i < ls.length; i++) { U.lPos.array[i].copy(ls[i].p); U.lCol.array[i].copy(ls[i].c); }
      r.compute(compute);
    },
    dispose() { grid.dispose(); },
  };
}
export function gpuSunLight(l, AIR, noise) {
  const c = new Color(), col = uniform(c).onRenderUpdate(() => c.copy(l.color).multiplyScalar(l.intensity)), role = uniform(0);
  const wp = positionWorld, S = live(AIR.gsSun), CL = live(AIR.gsCloud), DR = live(AIR.gsDrift);
  const cuv = wp.xz.add(ORG.xz).add(S.xz.div(max(S.y, .15)).mul(CL.z.sub(wp.y)));
  const n = texture(noise, cuv.div(max(CL.w, 1)).add(DR)).r;
  const shade = select(live(AIR.gsAirOn).greaterThan(.5).and(CL.y.greaterThan(0)), float(1).sub(CL.y.mul(smoothstep(float(1).sub(CL.x), float(1.12).sub(CL.x.mul(.6)), n))), float(1));
  const sc = CASC.m.mul(vec4(wp, 1)), p = sc.xyz.div(sc.w), e = min(p.xy, p.xy.oneMinus());
  const nearW = select(p.z.greaterThan(0).and(p.z.lessThan(1)), smoothstep(0, CASC.fade, min(e.x, e.y)), float(0));
  l.colorNode = col.mul(shade).mul(select(role.equal(1), nearW, select(role.equal(2), nearW.oneMinus(), float(1))));
  return role;
}

export function gpuParticles(parts) {
  const g = parts.pts.geometry, A = n => { const a = g.attributes[n]; return new InstancedBufferAttribute(a.array, a.itemSize); };
  const pos = A('position'), size = A('size'), tint = A('tint');
  const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: parts.mat.blending === AdditiveBlending ? AdditiveBlending : NormalBlending });
  m.positionNode = instancedBufferAttribute(pos); m.scaleNode = instancedBufferAttribute(size);
  const tn = instancedBufferAttribute(tint), d = uv().sub(.5), r = dot(d, d).mul(4);
  const soft = parts.mat.uniforms.soft.value > .5;
  const a = soft ? float(1).sub(r).mul(float(1).sub(r)) : smoothstep(1, .3, r);
  m.colorNode = tn.rgb; m.opacityNode = tn.a.mul(a).mul(select(r.greaterThan(1), float(0), float(1)));
  const sp = new Sprite(m); sp.frustumCulled = false; sp.renderOrder = parts.pts.renderOrder; sp.count = 0;
  sp.userData.noAO = true;
  return { sprite: sp, sync(n) { for (const at of [pos, size, tint]) sendUsed(at, n); sp.count = n; } };
}

// The scene pass's extra pictures (normals, surface colour, shiny things, motion) say what the solid surface
// at each pixel is. three writes a pass's extra pictures with no blending unless told otherwise, so a see-through
// thing replaced them across everything it drew, its soft edges and empty corners too: each puff of dust (a soft
// disc on a square) put its own camera-facing normal over the ground's, ambient occlusion shaded the ground
// there as a wall facing the camera, and every puff sat in a dark square. Now those pictures are blended the
// material's own way (OWN), and what is drawn over the scene without writing depth (dust, smoke, glows, decals,
// blob shadows) writes nothing to them: zero leaves a picture as it was under every kind of blending three has.
// The surface behind keeps its normal and its ambient occlusion, as on WebGL, whose AO sees solid things only.
const OWN = new BlendMode(MaterialBlending);
class PerMaterial extends Node {   // one of two outputs, by the material being drawn (worked out once per material, when it compiles)
  constructor(pick) { super('vec4'); this.pick = pick; }
  setup(builder) { return this.pick(builder.material); }
}
const drawnOver = m => seeThrough(m) && m.depthWrite === false;
/** An extra picture of the scene's pass that things drawn over the scene leave alone (give the pass ownBlend() too). */
const surface = node => new PerMaterial(m => drawnOver(m) ? vec4(0) : node);
// (the normals picture's alpha: 1 where the pixel takes no ambient occlusion. See-through things that do write
// depth, water and glass, are the surface at their pixels: their normal goes in whole, with no AO on them)
// (kept in 8 bits a channel, as three's own examples keep it: the view-space normal moved into 0..1, packNormalToRGB; the
// readers take it back through sceneNormals below. A zero left by the pass's clear, or by something drawn over, stays zero)
const normalOut = skip => new PerMaterial(m => drawnOver(m) ? vec4(0) : vec4(packNormalToRGB(normalView), skip || seeThrough(m) ? 1 : 0));
/**
 * The scene pass's pictures in fewer bytes (Rob's Fold, 2026-11-13: three quarters of the chip's frame went on the passes
 * that read the scene's pictures, so bytes read and written a pixel are what it pays for): the normals in 8 bits a channel
 * (half the bytes; the alpha only says whether a pixel takes ambient occlusion) and the motion in two channels (its other
 * two were never read: frame generation, SGSR 2 and motion blur read x and y). The see-through mask keeps four (frame
 * generation reads all of it). Before the pass is first drawn (the formats are what its pipelines are built for).
 */
function slimPictures(sp, { normals, motion }) {
  if (normals) { const t = sp.getTexture('normal'); t.type = UnsignedByteType; t.colorSpace = NoColorSpace; }
  if (motion) sp.getTexture('velocity').format = RGFormat;
}
/** The scene's normals as the readers want them (view space, -1..1; zero where nothing solid was drawn): a node that can be sampled anywhere. */
function sceneNormals(sp) {
  const t = sp.getTextureNode('normal');
  return sample(q => { const c = t.sample(q); return select(dot(c.rgb, c.rgb).lessThan(1e-6), vec3(0), unpackRGBToNormal(c.rgb)); });
}
const ownBlend = (m, names) => { for (const n of names) m.setBlendMode(n, OWN); return m; };

/** A material that takes no ambient occlusion (hd3d.js seeThrough3d: see-through, cut-out, noAO). */
// Its own MRT (output, and a normal that says so: the AO pass skips it). three builds a material MRT against the
// target it is drawn into and keeps only the outputs the target has textures for, so in a target with none
// of them (a cube camera's, a card's copy) nothing was left: an empty WGSL output, an invalid pipeline and
// that frame's whole command buffer dropped. There the plain colour is written instead.
class SoftMRT extends MRTNode {
  setup(builder) {
    const tex = builder.renderer.getRenderTarget()?.textures || [];
    if (!Object.keys(this.outputNodes).some(n => tex.some(t => t.name === n))) {
      this.members = [output.convert(builder.getOutputType(0))];
      return OutputStructNode.prototype.setup.call(this, builder);
    }
    return super.setup(builder);
  }
}
export function noAO(m) { m.mrtNode = new SoftMRT({ output, normal: normalOut(true) }); }   // (output too: without an MRT in use, three draws the material's own MRT alone)

/* ---------- gs.props on WebGPU ---------- */
// Props draws each kind as an InstancedMesh2 (@three.ez/instanced-mesh), which reads its matrices from a
// texture through a WebGL shader patch. Here each of its detail levels is a plain InstancedMesh instead,
// filled each frame with the copies in view (a little wider, for their shadows) at that level's distance,
// from the same matrices, visibility and colours.
// Each copy keeps its place (slot) in a level's list while it stays in view: three works out motion
// (frame generation, SGSR 2) from what each slot held last frame, so a list packed afresh every frame gave
// a tree another tree's motion whenever one came into or left the view (trees and lamps broke up in made
// frames). A copy that leaves keeps its slot for a few frames (it is off screen or behind a wall, so
// drawing it costs a little and shows nothing), so one coming straight back still has its true motion;
// a new one takes a free slot while it is still in the margin round the view, and three's list of last
// frame is told where it stands too, so in its first frame it moves with the camera like everything round it
// (a copy changing detail level takes a new slot in the middle of the picture: its motion came from whatever
// held that slot before, and a made frame smeared it across the screen).
// Only what changes goes up to the chip: a copy that stays in its slot is not written again (unless the
// game moved or recoloured a copy: the library's textures say so), and the slots that did change go up as
// a few short ranges. three keeps "last frame's" list in a copy of each list for motion, sent whole
// whenever the list changes: it is handed the same ranges a frame later. (Every copy in view written and
// sent every frame, twice over, was most of what a forest cost while frame generation ran.)
const PF = new Frustum(), PS = new Sphere(), PM = new Matrix4(), PV = new Vector3(), SF = [];
const PROP_LINGER = 20;   // frames a copy that left the view keeps its slot
const PROP_RANGES = 48, PROP_GAP = 6;   // most ranges of changed slots sent for a list in a frame (more: one range over them all); slots apart that still share a range
// the slots of a list that changed this frame, as ranges [start, end) in R (n of them), slots given in any order
function touchSlot(R, s) {
  const n = R.n;
  if (n) { const a = R.a[n * 2 - 2], b = R.a[n * 2 - 1]; if (s >= a - PROP_GAP && s <= b + PROP_GAP) { if (s < a) R.a[n * 2 - 2] = s; if (s >= b) R.a[n * 2 - 1] = s + 1; return; } }
  if (n < PROP_RANGES) { R.a[n * 2] = s; R.a[n * 2 + 1] = s + 1; R.n = n + 1; return; }
  let lo = s, hi = s + 1; for (let i = 0; i < n; i++) { lo = Math.min(lo, R.a[i * 2]); hi = Math.max(hi, R.a[i * 2 + 1]); }
  R.a[0] = lo; R.a[1] = hi; R.n = 1;
}
// marks those ranges of an attribute to go up (ranges from a frame it wasn't drawn in are still waiting: kept, up to a point)
function sendRanges(a, R, n = R.n) {
  if (!a || !n) return;
  if (a.updateRanges.length > PROP_RANGES * 2) { let hi = 0; for (const r of a.updateRanges) hi = Math.max(hi, r.start + r.count); for (let i = 0; i < n; i++) hi = Math.max(hi, R.a[i * 2 + 1] * a.itemSize); a.clearUpdateRanges(); a.addUpdateRange(0, Math.min(a.array.length, hi)); }
  else for (let i = 0; i < n; i++) a.addUpdateRange(R.a[i * 2] * a.itemSize, (R.a[i * 2 + 1] - R.a[i * 2]) * a.itemSize);
  a.needsUpdate = true;
}
// ...and of three's copy of a list for motion (S.prev). three sets that copy's version back to the list's own
// after every draw, and only sends what has a higher version than the one last sent, so a plain "needs
// update" can land on the version already sent and wait a frame: this one is always higher.
function sendPrev(S, R) {
  if (!S.prev || !R.n) return;
  sendRanges(S.prev, R); S.prev.version = S.pv = Math.max(S.prev.version, S.pv + 1);
}
export function gpuProps(im) {
  const levels = im.LODinfo?.render ? im.LODinfo.render.levels.map(l => ({ obj: l.object, lod: l, dist: 0 })) : [{ obj: im, lod: null, dist: 0 }];
  // (the library keeps distances squared; read each frame: a game moves them for a scope's zoom, and hd3d.js autoCopies for the picture's size)
  const dists = () => { for (const l of levels) if (l.lod) l.dist = l.lod.distance * (1 - (l.lod.hysteresis || 0)); };
  dists();
  const group = new Group(); group.name = im.name + ':webgpu';
  let cap = 0, tw = [], want = null, sph = null;
  // stale: the game has moved or recoloured a copy since the lists were filled (every such write goes through the library's textures)
  let stale = true, mt = null, ct = null; const wmWas = new Float64Array(16);
  const hook = t => { if (!t) return; if (!t.gsHooked) { t.gsHooked = true; const own = t.enqueueUpdate; t.enqueueUpdate = function (i) { this.gsStale?.(); return own.call(this, i); }; } t.gsStale = () => { stale = true; }; };
  const watch = () => { if (im.matricesTexture !== mt) { mt = im.matricesTexture; hook(mt); stale = true; } if (im.colorsTexture !== ct) { ct = im.colorsTexture; hook(ct); stale = true; } };
  const make = () => {
    for (const t of tw) { t.removeFromParent(); t.dispose(); }
    cap = Math.max(16, im._capacity || im._instancesArrayCount || 16);
    want = new Int8Array(cap); sph = new Float32Array(cap * 4); stale = true;
    tw = levels.map(({ obj }) => {
      const src = obj.geometry, g = new BufferGeometry();   // the same buffers, without the library's index attribute
      for (const k in src.attributes) if (k !== 'instanceIndex') g.setAttribute(k, src.attributes[k]);
      g.setIndex(src.index); g.groups = src.groups;
      if (!src.boundingSphere) src.computeBoundingSphere(); g.boundingSphere = src.boundingSphere;
      const m = new InstancedMesh(g, obj.material, cap); m.count = 0; m.frustumCulled = false;
      m.castShadow = im.castShadow; m.receiveShadow = im.receiveShadow;
      m.userData.gsTwin = im;   // (hd3d.js shadowLights: its shadow changes when the props do, not when this view's culling does)
      if (im.colorsTexture) m.instanceColor = new IBA(new Float32Array(cap * 3), 3);
      // slotOf: copy -> slot + 1 (0: none); owner: slot -> copy + 1; idle: frames since its copy left the view;
      // now, last: the slots changed this frame and last, as ranges; fresh: the slots taken this frame;
      // prev: three's copy of the list for motion, once it makes one
      m.userData.slots = { slotOf: new Int32Array(cap), owner: new Int32Array(cap), idle: new Uint16Array(cap), top: 0,
        now: { a: new Int32Array(PROP_RANGES * 2), n: 0 }, last: { a: new Int32Array(PROP_RANGES * 2), n: 0 }, fresh: { a: new Int32Array(PROP_RANGES * 2), n: 0 }, prev: null, pv: 0 };
      const list = m.instanceMatrix, clone = list.clone; list.clone = function () { const c = clone.call(this); m.userData.slots.prev = c; return c; };
      group.add(m); return m;
    });
  };
  make();
  // GPU culling (props-gpu.js; hd3d.js says when): its own meshes, so the CPU lists keep their slots for switching back
  let gc = null, onGpu = false;
  const useGpu = on => { if (on && !gc) gc = gpuCull(im, levels, group); if (on === onGpu) return; onGpu = on; for (const t of tw) t.visible = false; for (const m of gc?.meshes || []) m.visible = on; };
  // a slot drawn as nothing: every point at the copy's own place
  const hide = (M, m0) => { const x = M[m0 + 12], y = M[m0 + 13], z = M[m0 + 14]; M.fill(0, m0, m0 + 16); M[m0 + 12] = x; M[m0 + 13] = y; M[m0 + 14] = z; M[m0 + 15] = 1; };
  return {
    group,
    /** Copies this many or more draw with GPU culling where allowed (HD.gpuCull 'auto'). */
    gpuFits: gpuCullFits(levels),
    isGpu: () => onGpu,   // (a function: the twin is copied with ...spread in hd3d.js)
    sends: () => gc?.sends() ?? 0,
    sync(cam, occ = null, shadowCams = null, gpuR = null) {   // occ: occlusion culling, a function of the copy's number (occlude.js copiesHidden; only for props without shadows: one list feeds both here); shadowCams: the lights' shadow cameras (a copy off screen that casts into view is kept); gpuR: the renderer, to cull on the GPU instead
      dists();
      useGpu(!!gpuR && this.gpuFits);
      if (onGpu) { gc.sync(gpuR, cam, shadowCams); for (const m of gc.meshes) m.visible = true; return; }
      if ((im._capacity || 0) > cap) make();
      const n = Math.min(cap, im._instancesArrayCount || 0), D = im.matricesTexture?._data, C = im.colorsTexture?._data, wm = im.matrixWorld;
      if (!D) { for (const t of tw) { t.count = 0; t.userData.slots.top = 0; t.userData.slots.slotOf.fill(0); t.userData.slots.owner.fill(0); } stale = true; return; }
      cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); PF.setFromProjectionMatrix(PM, cam.coordinateSystem);
      const nsf = im.castShadow && shadowCams ? shadowCams.length : 0;
      for (let j = 0; j < nsf; j++) { const c = shadowCams[j]; (SF[j] ||= new Frustum()).setFromProjectionMatrix(PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse), c.coordinateSystem); }
      const cp = cam.getWorldPosition(PV), cx = cp.x, cy = cp.y, cz = cp.z, R0 = levels[0].obj.geometry.boundingSphere?.radius ?? 1;
      // where each copy is and how far it reaches, worked out again only when a copy or the whole set has moved
      watch();
      const we = wm.elements; let moved = sph.r0 !== R0 || sph.n !== n; for (let j = 0; j < 16; j++) if (wmWas[j] !== we[j]) { wmWas[j] = we[j]; moved = true; }
      const all = stale; stale = false;
      if (all || moved) {
        for (let i = 0; i < n; i++) {
          const o = i * 16, sx = Math.sqrt(D[o] * D[o] + D[o + 1] * D[o + 1] + D[o + 2] * D[o + 2]), sy = Math.sqrt(D[o + 4] * D[o + 4] + D[o + 5] * D[o + 5] + D[o + 6] * D[o + 6]), sz = Math.sqrt(D[o + 8] * D[o + 8] + D[o + 9] * D[o + 9] + D[o + 10] * D[o + 10]);   // (Math.hypot made garbage for each copy)
          PS.center.set(D[o + 12], D[o + 13], D[o + 14]).applyMatrix4(wm);
          const q = i * 4; sph[q] = PS.center.x; sph[q + 1] = PS.center.y; sph[q + 2] = PS.center.z; sph[q + 3] = R0 * Math.max(sx, sy, sz) + 8;   // (+8 m: things just out of view still cast their shadows in)
        }
        sph.r0 = R0; sph.n = n;
      }
      // which level each copy is drawn at this frame (-1: not drawn)
      want.fill(-1, 0, n);
      for (let i = 0; i < n; i++) {
        if (!im.getActiveAndVisibilityAt(i)) continue;
        const q = i * 4; PS.center.set(sph[q], sph[q + 1], sph[q + 2]); PS.radius = sph[q + 3];
        if (!PF.intersectsSphere(PS)) { let j = 0; while (j < nsf && !SF[j].intersectsSphere(PS)) j++; if (j === nsf) continue; }
        if (occ && !im.castShadow && occ(i)) continue;
        const d = (PS.center.x - cx) ** 2 + (PS.center.y - cy) ** 2 + (PS.center.z - cz) ** 2;   // squared, like the levels
        let L = 0; while (L + 1 < levels.length && d >= levels[L + 1].dist) L++;
        want[i] = L;
      }
      for (let L = 0; L < tw.length; L++) {
        const t = tw[L], S = t.userData.slots, M = t.instanceMatrix.array, A = t.instanceColor?.array;
        // (copied number by number: a subarray view per copy per frame was garbage for the collector)
        const R = S.now, was = S.last; S.now = was; S.last = R;   // (last frame's ranges, for three's copy of the list; this frame's start empty)
        sendPrev(S, R);
        const N = S.now, F = S.fresh, P = S.prev?.array; N.n = 0; F.n = 0;
        const put = (s, i) => { const m0 = s * 16, o = i * 16; for (let j = 0; j < 16; j++) M[m0 + j] = D[o + j]; if (C && A) { const a0 = s * 3, c0 = i * 4; A[a0] = C[c0]; A[a0 + 1] = C[c0 + 1]; A[a0 + 2] = C[c0 + 2]; } touchSlot(N, s); };
        // the copies already here: stay put (written again only if the game has changed a copy); gone: linger a while (unless now drawn at another level), then free the slot
        for (let s = 0; s < S.top; s++) {
          const i = S.owner[s] - 1; if (i < 0) continue;
          if (i < n && want[i] === L) { if (all) put(s, i); S.idle[s] = 0; continue; }
          if (i < n && want[i] < 0 && im.getActiveAndVisibilityAt(i) && ++S.idle[s] <= PROP_LINGER) continue;
          hide(M, s * 16); S.owner[s] = 0; S.slotOf[i] = 0; touchSlot(N, s);
        }
        // the copies new to this level: the lowest free slots
        let free = 0;
        for (let i = 0; i < n; i++) {
          if (want[i] !== L || S.slotOf[i]) continue;
          while (free < S.top && S.owner[free]) free++;
          const s = free < S.top ? free : S.top++;
          S.owner[s] = i + 1; S.slotOf[i] = s + 1; S.idle[s] = 0; put(s, i);
          // (last frame it stood where it stands now, as far as anyone knows: not where the slot's last copy did)
          if (P) { const m0 = s * 16; for (let j = 0; j < 16; j++) P[m0 + j] = M[m0 + j]; touchSlot(F, s); }
        }
        while (S.top && !S.owner[S.top - 1]) S.top--;
        t.count = S.top;
        // (only the slots that changed go up to the chip)
        sendRanges(t.instanceMatrix, N); sendRanges(t.instanceColor, N); sendPrev(S, F);
        t.visible = t.count > 0;
      }
    },
    dispose() { for (const t of tw) t.dispose(); gc?.dispose(); },
  };
}

/* ---------- contact shadows (hd3d.js ContactShadows) ---------- */
// The same steps on this renderer: shadow casters drawn from below into a small picture (darker the
// closer to the floor), blurred across and down twice, shown on the floor plane.
const BLUR_W = [.051, .0918, .12245, .1531, .1633, .1531, .12245, .0918, .051];
export function gpuContact(cs) {
  const dark = uniform(cs.depth.userData.dark.value);
  const over = new MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
  over.colorNode = vec3(0); over.opacityNode = float(1).sub(depth).mul(dark);
  let res = 0, a = null, b = null;
  const src = texture(new Texture()), step = uniform(new Vector2()), mat = new NodeMaterial(), quad = new QuadMesh(mat);
  mat.fragmentNode = Fn(() => {
    let sum = vec4(0);
    for (let i = -4; i <= 4; i++) sum = sum.add(src.sample(uv().add(step.mul(i))).mul(BLUR_W[i + 4]));
    return sum;
  })();
  const blur = (r, x, y) => { src.value = a.texture; step.value.set(x, 0); r.setRenderTarget(b); quad.render(r); src.value = b.texture; step.value.set(0, y); r.setRenderTarget(a); quad.render(r); };
  return {
    update(r, scene, want) {
      if (cs.enabled === false) want = 0;
      if (want !== res) { a?.dispose(); b?.dispose(); res = want; a = b = null; if (res) { a = new RenderTarget(res, res); b = new RenderTarget(res, res); } }
      cs.plane.visible = !!res; if (!res) return;
      if (cs.mat.map !== a.texture) { cs.mat.map = a.texture; cs.mat.needsUpdate = true; }
      dark.value = cs.depth.userData.dark.value;
      const hidden = [];
      eachShown(scene, o => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && (!o.castShadow || o.userData.noContact)) hidden.push(o); });
      for (const o of hidden) o.visible = false;
      const bg = scene.background, fog = scene.fog, fogN = scene.fogNode, env = scene.environment, prevT = r.getRenderTarget(), clr = r.getClearAlpha();
      scene.background = null; scene.fog = null; scene.fogNode = null; scene.overrideMaterial = over;
      r.setClearAlpha(0); r.setRenderTarget(a); r.clear(); r.render(scene, cs.cam);
      scene.overrideMaterial = null; scene.background = bg; scene.fog = fog; scene.fogNode = fogN; scene.environment = env;
      for (const o of hidden) o.visible = true;
      const k = cs.blurAmount / 256; blur(r, k, k); blur(r, k * .4, k * .4);
      r.setRenderTarget(prevT); r.setClearAlpha(clr);
    },
    dispose() { a?.dispose(); b?.dispose(); over.dispose(); mat.dispose(); },
  };
}

/* ---------- bloom (hd3d.js BRIGHT, DOWN, UP: the same small chain) ---------- */
// The bright parts at the tier's bloom size (half the picture), shrunk four more times, then grown back
// up, each step adding a softer copy. Three's own bloom node spreads much wider and lifts dark rooms,
// so this is the WebGL chain step for step. size(w, h, scale) each frame; out is the sum at the top level.
const NO_FXK = { reflections: 1, vol: 1, shafts: 1 };   // (render(o) without o.fxK: every effect at its tier's size)
function bloomChain(src, aoF) {
  const N = 5, px = [], M = [];
  const lvl = (fn, i) => { const p = uniform(new Vector2(1, 1)); px[i] = p; return fn(p); };
  // bright parts only (anything brighter than the threshold keeps its full colour, fading in just under it), 4 taps
  M[0] = rtt(lvl(p => {
    const pick = o => { const c = src.sample(uv().add(o.mul(p))).rgb.mul(aoF); return c.mul(smoothstep(.77, .87, dot(c, LUM))); };
    return vec4(pick(vec2(-1, -1)).add(pick(vec2(1, -1))).add(pick(vec2(-1, 1))).add(pick(vec2(1, 1))).mul(.25), 1);
  }, 0), 1, 1, { depthBuffer: false });
  for (let i = 1; i < N; i++) {
    const t = M[i - 1];
    M[i] = rtt(lvl(p => {
      const c = t.sample(uv()).rgb.mul(4).add(t.sample(uv().add(vec2(p.x.negate(), p.y.negate()))).rgb).add(t.sample(uv().add(vec2(p.x, p.y.negate()))).rgb)
        .add(t.sample(uv().add(vec2(p.x.negate(), p.y))).rgb).add(t.sample(uv().add(p)).rgb);
      return vec4(c.div(8), 1);
    }, i), 1, 1, { depthBuffer: false });
  }
  const upPx = [], up = (t, i) => {
    const p = uniform(new Vector2(1, 1)); upPx[i] = p; const at = o => t.sample(uv().add(o)).rgb;
    const c = at(vec2(p.x.mul(-2), 0)).add(at(vec2(p.x.mul(2), 0))).add(at(vec2(0, p.y.mul(-2)))).add(at(vec2(0, p.y.mul(2))))
      .add(at(vec2(p.x.negate(), p.y.negate())).add(at(vec2(p.x, p.y.negate()))).add(at(vec2(p.x.negate(), p.y))).add(at(p)).mul(2));
    return c.div(12);
  };
  // grow back up: U[i] = M[i] + up(U[i + 1]); the top one is added straight into the final picture
  // (rtt with a size of its own: sized in size() below, not with the screen)
  const Us = []; let U = M[N - 1];
  for (let i = N - 2; i >= 1; i--) U = Us[i] = rtt(vec4(M[i].sample(uv()).rgb.add(up(U, i)), 1), 1, 1, { depthBuffer: false });
  const out = M[0].sample(uv()).rgb.add(up(U, 0));
  const nodes = [...M];
  for (const n of [...nodes, ...Us]) if (n?.renderTarget) n.renderTarget.gsPart = 'bloom';   // (hd3d.js gpuTime: the chip's time by pass)
  return {
    out,
    size(w, h, scale) {
      // the same sizes as FinalPass.setSize: the tier's scale, then halving
      let bw = Math.max(1, Math.round(w * scale)), bh = Math.max(1, Math.round(h * scale));
      const sz = [];
      for (let i = 0; i < N; i++) { sz.push([bw, bh]); bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
      if (this.key === `${w}x${h}x${scale}`) return; this.key = `${w}x${h}x${scale}`;
      px[0].value.set(.5 / w, .5 / h);
      for (let i = 0; i < N; i++) { nodes[i].setSize(sz[i][0], sz[i][1]); if (i) px[i].value.set(1 / sz[i - 1][0], 1 / sz[i - 1][1]); }
      for (let i = 0; i < N - 1; i++) upPx[i].value.set(.5 / sz[i + 1][0], .5 / sz[i + 1][1]);
      for (let i = 1; i < N - 1; i++) Us[i].setSize(sz[i][0], sz[i][1]);
    },
    dispose() { for (const n of [...nodes, ...Us]) n?.renderTarget?.dispose(); },
  };
}

/* ---------- the screen effects ---------- */
// The last touches on the finished picture: vignette, film grain and the hurt flash. t moves the
// grain on; k is the size of a drawn pixel on the screen (the grain is one drawn pixel big, as before
// upscaling). With frame generation they go on as each refresh is shown, so the grain is new every
// refresh (blending two frames' grain would halve it on every other one) and the vignette and the
// hurt flash stay put instead of moving with the picture.
function touches(U, col, t, k) {
  const d = screenUV.sub(.5), r2 = dot(d, d);
  col = col.mul(float(1).sub(U.vig.mul(smoothstep(.12, .62, r2.mul(1.6)))));                       // vignette
  const p = floor(vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y)).mul(k)).add(.5).add(t);   // (WebGL counts pixel rows from the bottom)
  col = col.add(fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)).sub(.5).mul(U.grain));     // grain
  return mix(col, col.mul(vec3(1.25, .45, .4)).add(vec3(.12, 0, 0)), U.hurt.mul(smoothstep(.04, .4, r2)));   // hurt
}
// Snapdragon GSR 1 on WebGPU: sgsr.js's one pass (Qualcomm, BSD 3-Clause; the licence and what changed
// are in that file), written as TSL. The finished small picture is drawn at the render size, then this
// draws it at the screen's size: a 12-tap Lanczos-like filter on the edges with adaptive sharpening,
// the rest a plain bilinear read, alpha kept (AR draws over the camera). It works in WebGL's frame
// (rows counted from the bottom), as the shader was written, by turning the reads over.
function sgsr1Gpu(src) {
  const low = rtt(src, 1, 1, { depthBuffer: false, type: HalfFloatType }), vp = uniform(new Vector4(1, 1, 1, 1)); low.renderTarget.gsPart = 'finish';   // 1/w, 1/h, w, h of the small picture
  const node = Fn(() => {
    const H = int(vp.w), hi = ivec2(int(vp.z).sub(1), H.sub(1));
    const g = p => low.load(ivec2(p.x, H.sub(1).sub(p.y))).g;
    // textureGather(tex, coord, 1): the green of the 2 x 2 texels round coord, in gather order
    const gather = c => {
      const p = ivec2(floor(c.mul(vp.zw).sub(.5))), a = clamp(p, ivec2(0, 0), hi), b = clamp(p.add(1), ivec2(0, 0), hi);
      return vec4(g(ivec2(a.x, b.y)), g(b), g(ivec2(b.x, a.y)), g(a));
    };
    const lanczos = x => { const wA = x.sub(4), wB = x.mul(wA).sub(wA); return wB.mul(wA.mul(wA)); };
    const src0 = low.sample(screenUV), out = vec3(src0.rgb).toVar();
    const imgCoord = vec2(screenUV.x, float(1).sub(screenUV.y)).mul(vp.zw).add(vec2(-.5, .5)), pix = floor(imgCoord), pl = imgCoord.sub(pix);
    const coord = pix.mul(vp.xy).toVar(), left = gather(coord).toVar();
    const edgeVote = abs(left.z.sub(left.y)).add(abs(out.y.sub(left.y))).add(abs(out.y.sub(left.z)));
    If(edgeVote.greaterThan(8 / 255), () => {
      coord.assign(coord.add(vec2(vp.x, 0)));
      const right = gather(coord.add(vec2(vp.x, 0))).toVar();
      const u0 = gather(coord.add(vec2(0, vp.y.negate()))), u1 = gather(coord.add(vec2(0, vp.y)));
      const upDown = vec4(u0.w, u0.z, u1.y, u1.x).toVar();
      const mean = left.y.add(left.z).add(right.x).add(right.w).mul(.25);
      left.assign(left.sub(mean)); right.assign(right.sub(mean)); upDown.assign(upDown.sub(mean));
      const cw = out.y.sub(mean);
      const a4 = v => abs(v.x).add(abs(v.y)).add(abs(v.z)).add(abs(v.w));
      const std = float(2.181818).div(max(a4(left).add(a4(right)).add(a4(upDown)), 1e-5));
      const wy = (dx, dy, c) => { const w = lanczos(dx.mul(dx).add(dy.mul(dy)).mul(.55).add(clamp(abs(c).mul(std), 0, 1))); return vec2(w, w.mul(c)); };
      const X = pl.x, Y = pl.y;
      const aWY = wy(X, Y.add(1), upDown.x).add(wy(X.sub(1), Y.add(1), upDown.y)).add(wy(X.sub(1), Y.sub(2), upDown.z)).add(wy(X, Y.sub(2), upDown.w))
        .add(wy(X.add(1), Y.sub(1), left.x)).add(wy(X, Y.sub(1), left.y)).add(wy(X, Y, left.z)).add(wy(X.add(1), Y, left.w))
        .add(wy(X.sub(1), Y.sub(1), right.x)).add(wy(X.sub(2), Y.sub(1), right.y)).add(wy(X.sub(2), Y, right.z)).add(wy(X.sub(1), Y, right.w));
      const maxY = max(max(left.y, left.z), max(right.x, right.w)), minY = min(min(left.y, left.z), min(right.x, right.w));
      const finalY = clamp(aWY.y.div(aWY.x).mul(2), minY, maxY);   // edge sharpness 2
      out.assign(clamp(out.add(clamp(finalY.sub(cw), -23 / 255, 23 / 255)), 0, 1));   // (smooth high-contrast input)
    });
    return vec4(out, src0.a);
  })();
  return { node, size(w, h) { if (vp.value.z !== w || vp.value.w !== h) { low.setSize(w, h); vp.value.set(1 / w, 1 / h, w, h); } }, dispose() { low.dispose?.(); } };
}

// One chain per view (it draws that view's scene and camera). rebuild() when the shape changes (AO on
// or off, smoothing, see-through for AR); the numbers are uniforms set each frame.
// Snapdragon GSR 2 on WebGPU: the same two passes as sgsr2.js (Qualcomm, BSD 3-Clause; the licence and
// what changed are in that file), written as TSL. The finished small picture (fin) and the motion
// picture are drawn at the render size; the upscale is drawn at the screen's size into a history
// picture, which is copied to the screen and kept for next frame. Pictures here count rows from the
// top, so this is the shader's REQUEST_NDC_Y_UP variant, and WebGPU depth is already 0..1 like NDC z.
// mo (when the scene's pass writes them, frameGenMRT): each pixel's own motion and the see-through mask.
// With them, things that move by themselves are followed (the shader's motion vector input; without, all
// motion comes from the depth and the camera's move, so moving things smear), and see-through things
// (sparks, smoke, glass) lean on the new frame instead of the history, so they leave no trails.
// tuned (the usual; HD.sgsrTune = false is Qualcomm's shader as it was, for comparing): two changes of
// ours to the upscale pass, each kept because it measured better (scripts/upscale-compare.cjs), and the
// same two as the WebGL version's (sgsr2.js):
// - the history is read sharply (framegen.js sharpAt: Catmull-Rom in 5 reads) where the shader read it
//   bilinearly. It is read again every frame the camera moves, and bilinear softens it a little each
//   time: with the camera moving the picture came out no closer to the full-size one than a plain stretch
// - a pixel that stays put settles: how long it has been left alone is kept in the history's alpha and
//   makes the history count for more there, up to S2_HOLD times, so a still picture shimmers less on
//   thin things and edges. Anything that moves, a cut or a see-through thing starts from the usual again
// (Tried and left out, each measured worse or no better: sharpening after the upscale, a colour box
// from 9 pixels in place of 5, and a looser colour box at full size.)
// SGSR 2's upscale maths, in half where the chip has it (half.js): Lanczos of the 5 nearest small pixels
// (S2_TAPS, the shader's order), a colour box from their mean and spread, the history clamped to it, then
// blended. so: this pixel's centre from the nearest small pixel's; hist: the history read at where this
// pixel was; m: the motion's length in pixels, the depth clip, the history's weight where nothing moved, a
// cut (1); see: how see-through (the new frame counts for at least this); tuned: our two changes (sgsr2Gpu).
// Each step is the same as the TSL it was written from, in the same order (the build machine's pictures
// came out the same); only the smallest number divided by is bigger in half (HEPS).
const S2_TAPS = [[0, 1], [1, 0], [-1, 0], [0, 0], [0, -1]];
const S2_UP = halfFn('gsS2Up', `(c0: vec3<f32>, c1: vec3<f32>, c2: vec3<f32>, c3: vec3<f32>, c4: vec3<f32>, so: vec2<f32>, hist: vec4<f32>, m: vec4<f32>, sr: vec2<f32>, see: f32, tuned: f32) -> vec4<f32> {
  let mlen = hf(min(m.x, 1e4)); let df = hf(m.y); let start = hf(m.z); let reset = hf(m.w);
  let biasmax = hf(sr.x); let biasmin = max(hf(1.0), biasmax * hf(0.3) + hf(0.3));
  let kb = mix(biasmax, biasmin, df * hf(0.25)) * hf(0.5); let kb2 = kb * kb;
  let curve = mix(hf(-2.0), hf(-3.0), clamp(mlen * hf(0.02), hf(0.0), hf(1.0)));
  let s = hf2(so);
  var sw = hf(0.0); var scw = hf3(0.0); var bmin = hf3(c0); var bmax = hf3(c0); var sb = hf(0.0); var cen = hf3(0.0); var vr = hf3(0.0);
${S2_TAPS.map(([x, y], i) => `  { let c = hf3(c${i}); let o = s + hf2(${x.toFixed(1)}, ${y.toFixed(1)}); let dd = dot(o, o); let y = clamp(dd * kb2, hf(0.0), hf(1.0)) - hf(1.0);
    let w = (y * hf(0.75) + y * y) * (y * y); let bw = exp(dd * curve);
    sw += w; scw += c * w; bmin = min(bmin, c); bmax = max(bmax, c); sb += bw; cen += c * bw; vr += c * c * bw; }`).join('\n')}
  cen = cen / sb; vr = sqrt(abs(vr / sb - cen * cen));
  let upc = clamp(scw / sw, bmin - hf(0.075), bmax + hf(0.075)); let upw = sw * hf(${1 / 3});
  let hc = hf3(hist.rgb);
  var held = hf(1.0);
  if (tuned > 0.5) { held = min(clamp(hf(hist.a), hf(0.0), hf(1.0)) * hf(${(S2_HOLD - 1).toFixed(1)}) + hf(1.0), mix(hf(${S2_HOLD.toFixed(1)}), hf(1.0), clamp(mlen * hf(10.0), hf(0.0), hf(1.0)))); }
  var base = held * (hf(1.0) - df);
  base = min(base, mix(base, upw * hf(10.0), clamp(mlen * hf(10.0), hf(0.0), hf(1.0))));
  base = min(base, mix(base, upw, clamp(mlen * hf(0.05), hf(0.0), hf(1.0))));
  let boxsize = mix(hf(sr.y), hf(1.0), max(df, clamp(mlen * hf(0.05), hf(0.0), hf(1.0))));
  let lo = max(bmin, cen - vr * boxsize); let hi = min(bmax, cen + vr * boxsize);
  let clamped = clamp(hc, lo, hi);
  let outside = any(lo > hc) || any(hc > hi);
  let lerpC = clamp(select(hf(1.0), start, outside), hf(0.0), hf(1.0));
  let h = mix(clamped, hc, lerpC);
  let ba = mix(min(base, hf(0.1)), base, lerpC);
  let own = upw / max(hf(HEPS), ba + upw);
  let a = max(clamp(own + reset, hf(0.0), hf(1.0)), hf(see));
  var settled = hf(1.0);
  if (tuned > 0.5) { settled = select(clamp((held + upw - hf(1.0)) / hf(${(S2_HOLD - 1).toFixed(1)}), hf(0.0), hf(1.0)), hf(0.0), a > own + hf(1e-4)); }
  return vec4<f32>(vec3<f32>(mix(h, upc, a)), f32(settled));
}`);
function sgsr2Gpu(fin, depthT, mo = null, tuned = true) {
  const U = { rs: uniform(new Vector2(1, 1)), os: uniform(new Vector2(1, 1)), jit: uniform(new Vector2()), sr: uniform(new Vector2(1, 1)),
    fov: uniform(1), minLerp: uniform(0), reset: uniform(1), c2p: uniform(new Matrix4()), jd: uniform(new Vector2()) };
  const low = rtt(fin, 1, 1, { depthBuffer: false }); low.renderTarget.gsPart = 'finish';   // (the finishing pass: hd3d.js gpuTime tells it apart from SGSR 2's own)
  // convert: motion back to last frame from the nearest depth and the camera's move, and the depth clip
  const conv = Fn(() => {
    const P = ivec2(screenCoordinate.xy), hi = ivec2(U.rs).sub(1);
    const D = (x, y) => depthT.load(clamp(P.add(ivec2(x, y)), ivec2(0, 0), hi)).x;
    // textureGather's order round the 2 x 2 texels from o: (0,1) (1,1) (1,0) (0,0)
    const G = (ox, oy) => ({ x: D(ox, oy + 1), y: D(ox + 1, oy + 1), z: D(ox + 1, oy), w: D(ox, oy) });
    const bl = G(-1, -1), br = G(1, -1), tl = G(-1, 1), tr = G(1, 1);
    const min4 = g => min(min(g.y, g.x), min(g.z, g.w));
    const maxC = min(min(min(bl.z, br.w), tl.y), tr.x).toVar();
    const bl9 = min(tl.x, min(min(maxC, min4(bl)), br.x));
    const sep = float(1.37e-05).mul(U.fov).mul(length(U.rs)).mul(float(1).sub(maxC));
    const w = g => clamp(sep.div(abs(maxC.sub(min4(g))).add(1.19e-07)), 0, 1);
    const clip = select(maxC.lessThan(1 - 1e-5), clamp(float(1).sub(w(bl).add(w(br)).add(w(tl)).add(w(tr)).mul(.25)), 0, 1), float(0));
    const u = vec2(P).add(.5).div(U.rs), ndc = vec2(u.x.mul(2).sub(1), float(1).sub(u.y.mul(2)));
    const pre = U.c2p.mul(vec4(ndc, bl9, 1)), camM = ndc.sub(pre.xy.div(pre.w));
    if (!mo) return vec4(camM, clip, 0);
    // the motion of the nearest surface in the 3 x 3 round it (edges move with what's in front), less the
    // change in jitter; where nothing was drawn (the sky), the camera's move
    const at = (x, y) => clamp(P.add(ivec2(x, y)), ivec2(0, 0), hi);
    const near = ivec2(P).toVar(), nz = depthT.load(P).x.toVar();
    for (const [x, y] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
      const z = depthT.load(at(x, y)).x; If(z.lessThan(nz), () => { nz.assign(z); near.assign(at(x, y)); });
    }
    const M = select(nz.lessThan(1 - 1e-6), mo.vel.load(near).xy.sub(U.jd), camM);
    return vec4(M, clip, mo.rea.load(P).x);
  })();
  const mdc = rtt(conv, 1, 1, { depthBuffer: false }); mdc.renderTarget.gsPart = 'upscale';
  // two history pictures taking turns: this frame's upscale is drawn into one while it reads last
  // frame's from the other. (Copying into a single history picture broke after a resize, like
  // unfolding a Fold: a picture that is only copied into keeps its old size on the GPU.)
  const H2 = [0, 1].map(() => new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false }));
  let cur = 0, fresh = true;   // fresh: nothing drawn yet, so the first frame starts the history (as after a cut)
  const histT = texture(H2[1].texture), outT = texture(H2[0].texture);
  // upscale: Lanczos of the 5 nearest small pixels, a colour box, history clamped to it, then blended
  const half = halfWanted();
  const upscale = Fn(() => {
    const H = screenUV, J = clamp(H.add(U.jit.div(U.rs)), 0, 1), IP = ivec2(J.mul(U.rs)), hi = ivec2(U.rs).sub(1);
    const mda = mdc.sample(J), M = mda.xy, df = mda.z, see = mo ? smoothstep(.1, .6, mda.w).mul(.9) : float(0);
    const prevUV = clamp(vec2(M.x.mul(-.5).add(H.x), M.y.mul(.5).add(H.y)), 0, 1);
    const hist = tuned ? sharpAt(histT, prevUV, half) : histT.sample(prevUV);
    const mlen = length(M.mul(U.os)), start = select(abs(M.x).add(abs(M.y)).greaterThan(1e-6), float(0), U.minLerp);
    // where this pixel's centre falls among the small pixels (full precision: a place on the screen), the
    // five nearest small pixels, and the rest of the pass's maths in half where the chip has it (S2_UP)
    const so = vec2(IP).add(.5).sub(U.jit).sub(H.mul(U.rs));
    const args = { so, hist, m: vec4(mlen, df, start, U.reset), sr: U.sr, see, tuned: float(tuned ? 1 : 0) };
    S2_TAPS.forEach(([x, y], i) => { args['c' + i] = low.load(clamp(IP.add(ivec2(x, y)), ivec2(0, 0), hi)).rgb; });
    return S2_UP(args, half);
  })();
  const upMat = new NodeMaterial(); upMat.fragmentNode = upscale; upMat.name = 'SGSR2';
  const cpMat = new NodeMaterial(); cpMat.fragmentNode = vec4(outT.sample(screenUV).rgb, 1); cpMat.name = 'SGSR2 out';
  const qUp = new QuadMesh(upMat), qCp = new QuadMesh(cpMat);
  return {
    U, key: '',
    size(pw, ph, fw, fh) {
      const k = `${pw}x${ph}>${fw}x${fh}`; if (k === this.key) return; this.key = k;
      low.setSize(pw, ph); mdc.setSize(pw, ph); for (const t of H2) t.setSize(fw, fh);
    },
    set(f) {
      U.rs.value.copy(f.renderSize); U.os.value.copy(f.outputSize); U.jit.value.copy(f.jitter); U.sr.value.copy(f.scaleRatio);
      U.fov.value = f.fovH; U.minLerp.value = f.minLerp; U.reset.value = fresh ? 1 : f.reset; fresh = false; U.c2p.value.copy(f.clipToPrevClip);
      if (f.jd) U.jd.value.set(f.jd[0], f.jd[1]);
    },
    // draw (the scene and the small finished picture are drawn on the way, by the nodes the upscale reads);
    // show = false leaves the screen alone (frame generation shows it, or a made frame, itself)
    render(r, show = true) {
      const tm = r.toneMapping, cs = r.outputColorSpace; r.toneMapping = NoToneMapping; r.outputColorSpace = LinearSRGBColorSpace;
      try {
        const into = H2[cur], from = H2[1 - cur]; histT.value = from.texture; outT.value = into.texture;
        r.setRenderTarget(into); qUp.render(r);
        r.setRenderTarget(null); if (show) qCp.render(r);
        cur = 1 - cur;
      } finally { r.toneMapping = tm; r.outputColorSpace = cs; }
    },
    /** The picture the last render() made (it stays until the render after next: the two take turns). */
    last() { return H2[1 - cur].texture; },
    /** The picture the render before that made (it stays until the next render draws over it). */
    before() { return H2[cur].texture; },
    dispose() { low.dispose(); mdc.dispose(); for (const t of H2) t.dispose(); upMat.dispose(); cpMat.dispose(); },
  };
}

// The grade (v.grade: saturation, contrast round mid grey, shadow and highlight tints) and the sun's glare
// (v.glare: a soft disc, a halo and two ghosts across the middle of the screen), in half where the chip has
// it (half.js). The same steps as the TSL they were written from. In half a colour can be at most 65,504, and
// contrast raises it to a power, so the grade works on the colour held to 180 (far past white: tone
// mapping makes anything over about 20 white anyway); the picture itself and the glare added to it stay full.
const GRADE = halfFn('gsGrade', `(col: vec3<f32>, sat: f32, con: f32, lo: vec3<f32>, hi: vec3<f32>, on: f32, uv: vec2<f32>, su: vec2<f32>, aspect: f32, seen: f32, sunCol: vec3<f32>, glare: f32) -> vec3<f32> {
  var out = col;
  if (on > 0.0) {
    let c = hf3(min(col, vec3<f32>(180.0))); let l = dot(c, hf3(${LUM_K.join(', ')}));
    var g = max(mix(hf3(l), c, hf(sat)), hf3(0.0));
    g = pow(g / hf(0.18) + hf(1e-5), hf3(hf(con))) * hf(0.18);
    g = g * mix(hf3(lo), hf3(hi), smoothstep(hf(0.15), hf(0.85), clamp(log2(l / hf(0.18) + hf(1e-4)) * hf(0.16) + hf(0.5), hf(0.0), hf(1.0))));
    out = mix(col, vec3<f32>(g), on);
  }
  let asp = hf2(hf(aspect), hf(1.0)); let s = hf2(su); let u = hf2(uv); let q = (u - s) * asp;
  let g1 = (u - (hf2(0.5) - (s - hf2(0.5)) * hf(0.55))) * asp; let g2 = (u - (hf2(0.5) - (s - hf2(0.5)) * hf(1.3))) * asp;
  let gl = exp(dot(q, q) * hf(-14.0)) * hf(0.5) + exp(length(q) * hf(-6.0)) * hf(0.22) + smoothstep(hf(0.06), hf(0.045), length(g1)) * hf(0.05) + smoothstep(hf(0.1), hf(0.08), length(g2)) * hf(0.035);
  return out + sunCol * f32(gl) * glare * seen;
}`);

// volumetric light's stand-in shadow map while the light has none (its numbers say so: never read)
const NO_LUT = new Data3DTexture(new Uint8Array(32).fill(255), 2, 2, 2); NO_LUT.needsUpdate = true;
const NO_SHADOW = new DepthTexture(1, 1); NO_SHADOW.compareFunction = LessEqualCompare;
const VOL_MAX = 48, MB_N = 8;   // (hd3d.js VOL_MAX and MB_N)
export class GpuChain {
  constructor(r, scene, cam, clear) {
    Object.assign(this, { r, scene, cam, clear, key: '' });
    this.pp = new RenderPipeline(r); this.pp.outputColorTransform = false;
    this.F = { tint: uniform(new Vector3(1, 1, 1)), th: uniform(.15), sp: uniform(.3), fade: uniform(20), k: uniform(1), dk: uniform(0), dirt: texture(new Texture()) };   // v.flare
    this.U = {
      giK: uniform(1), t: uniform(0), hurt: uniform(0), vig: uniform(.32), gradeOn: uniform(0), sat: uniform(1), con: uniform(1),
      lo: uniform(new Vector3(1, 1, 1)), hi: uniform(new Vector3(1, 1, 1)), glare: uniform(0), sunUV: uniform(new Vector2(.5, .5)),
      sunCol: uniform(new Color()), aspect: uniform(1), lutK: uniform(1),
      // HDR screens (gpu.js): how far past paper white the brightest highlights go (headroom - 1), and the exposure
      hdrK: uniform(0), hdrExp: uniform(1),
      // depth of field (hd3d.js DOF): at, range, depth, blur in pixels; camera near and far; one pixel
      lens: uniform(new Vector4()), cn: uniform(.1), cf: uniform(1000), px: uniform(new Vector2(1, 1)),
      // sun shafts (hd3d.js SHAFT_*): strength x how much the sun shows, and the light's colour
      shaft: uniform(0), shaftTint: uniform(new Color(1, .9, .75)),
      // the mask's start, full and cap brightness and scale (hd3d.js ShaftsPass.bright, from v.shaftsAt)
      shThr: uniform(1.1), shHi: uniform(1.1 * 2.2), shCap: uniform(1e9), shGain: uniform(1),
      // frame generation's last touches: the grain's own clock and size (touches())
      gt: uniform(0), gk: uniform(1), grain: uniform(.035),
    };
    // volumetric light and motion blur (hd3d.js VOL and MB: the same numbers, from beamsFrame and blurFrame)
    this.V = {
      shM: uniform(new Matrix4()), invProj: uniform(new Matrix4()), camWorld: uniform(new Matrix4()), camPos: uniform(new Vector3()),
      lDir: uniform(new Vector3(0, -1, 0)), lPos: uniform(new Vector3()), lt: uniform(new Vector4()), k: uniform(new Vector4()), steps: uniform(24), tint: uniform(new Color(0, 0, 0)),
      prevVP: uniform(new Matrix4()), mb: uniform(new Vector4()), mbObj: uniform(0),
    };
    this.bloomN = null; this.aoN = null;
    // the game on screen (live): each real frame is drawn into a picture and shown by a copy that adds the
    // last touches, so the refreshes in between can show made frames (framegen.js), a still scene can be
    // shown again without drawing it, and frame generation can come and go without rebuilding the chain.
    // fg: the generator; sched: where the refreshes since the newest real frame stand; fgWin: how often a
    // refresh between real frames didn't come, and how many made frames were dropped as late; realDone: when the
    // chip finishes the newest real frame (sent()); cost: the chip's time for a real and a made frame (hd3d.js); still: the still-picture check
    this.fg = null; this.sched = null; this.fgMode = null; this.fgWin = { real: 0, missed: 0, made: 0, dropped: 0 }; this.realDone = null; this.cost = null; this.still = null; this.lastShown = null;
    this.warp = uniform(new Matrix3()); this.aim = null; this.aimBase = newPose(); this.aimAt = -1e9;
    // gs.fx3d's screen effects (hd3d-gpu-fx.js): the slots they take in the chain, and reflections (v.reflect())
    this.fxSlots = []; this.fxR = []; this.fxN = []; this.fxK = 1; this.xKey = ''; this.reflOn = false; this.tracer = null;
  }
  build(aoOn, smooth, msaa, s2 = false, dofOn = false, shaftsOn = false, live = false, s1 = false, volOn = false, mbOn = false, mrtOn = false, tone = 'aces', lutOn = false, oitOn = false, flareOn = false, giOn = false) {
    const key = `${aoOn}|${smooth}|${msaa}|${this.clear}|${s2}|${dofOn}|${shaftsOn}|${live}|${s1}|${volOn}|${mbOn}|${mrtOn}|${tone}|${lutOn}|${oitOn}|${flareOn}|${giOn}|${halfKey()}`;
    const TM = TONE[tone] ?? ACESFilmicToneMapping;
    if (key === this.key) return;
    this.key = key; this.fg?.reset(); this.sched = null; this.still?.reset();
    this.aoN?.dispose?.(); this.dnN?.dispose?.(); this.dnT?.renderTarget?.dispose(); this.bloomN?.dispose(); this.s2?.dispose(); this.s1?.dispose(); this.dofT?.renderTarget?.dispose(); this.shM?.renderTarget?.dispose(); this.shB?.renderTarget?.dispose();
    for (const t of [this.volT, this.baseT, this.mbT]) t?.renderTarget?.dispose();
    this.giN?.dispose?.(); this.giT?.renderTarget?.dispose(); this.giN = this.giT = null;
    this.aoN = this.dnN = this.dnT = this.bloomN = this.s2 = this.s1 = this.dofT = this.shM = this.shB = this.volT = this.baseT = this.mbT = null;
    fxDispose(this); reflDispose(this); TR?.traceDispose(this);
    // v.oit: three's weighted blended order-independent transparency (McGuire and Bavoil) in place of the plain
    // scene pass: see-through things blend right whatever order they're drawn in (glass behind glass, smoke in water)
    const sp = this.sp = (oitOn ? oitPass : pass)(this.scene, this.cam, { samples: msaa || 0 });
    // frame generation and SGSR 2: the scene's pass also writes each pixel's motion and where see-through things are
    if (mrtOn && this.clear) { sp.setMRT(frameGenMRT()); slimPictures(sp, { motion: true }); }
    if (this.clear) {
      // AR: just the scene on a see-through background, tone mapped (bloom and the grade would tint the room behind it);
      // with SGSR 1, drawn small and upscaled (tone mapping named outright: drawn outside the pipeline's own)
      if (s1) { this.s1 = sgsr1Gpu(renderOutput(sp, TM, SRGBColorSpace)); this.pp.outputNode = this.s1.node; }
      else this.pp.outputNode = renderOutput(sp);
      this.pp.needsUpdate = true; return;
    }
    // the scene pass's pictures have to fit the chip's bytes a pixel (8 each: gpu.js asks for up to 64, a few
    // chips stop at 32): what doesn't fit is left out, reflections first, then live bounce light
    const fit = Math.floor((this.r.gsPixelBytes || 32) / 8) - 1 - (mrtOn ? 2 : mbOn ? 1 : 0) - (aoOn ? 1 : 0);
    if (giOn && fit < 1) giOn = false;
    // (the normals picture's alpha says whether a pixel takes ambient occlusion: see-through things,
    // leaf cards and anything marked noAO write 1, as WebGL's AO leaves them out: noAO() above; and what is
    // drawn over the scene without writing depth leaves these pictures as the surface behind it wrote them)
    // (live bounce light, v.liveBounce: each pixel's own surface colour too, which the bounced light tints)
    const nrm = aoOn ? { normal: normalOut(false), ...(giOn ? { diffuse: surface(vec4(diffuseColor.rgb, 1)) } : {}) } : {};
    // reflections (v.reflect()): one more picture, of which pixels are shiny things and how rough
    // (ray traced, hd3d-gpu-trace.js: each pixel's own mirror colour and smoothness, and whether the traced level holds the thing)
    const reflOn = aoOn && this.reflOn && fit >= (giOn ? 2 : 1), tr = reflOn ? this.tracer : null;
    if (reflOn) nrm.gsRefl = tr ? new PerMaterial(m => drawnOver(m) ? vec4(0) : TR.tracedMRT(m)) : surface(reflMRT());
    // (motion blur alone: velocity for each thing's own move; see-through things leave the motion behind them, as frameGenMRT's do)
    const pics = mrtOn ? frameGenMRT(nrm) : mbOn ? ownBlend(mrt({ output, velocity: new PerMaterial(m => seeThrough(m) ? vec4(0) : vec4(velocity, 0, 1)), ...nrm }), ['velocity']) : aoOn ? mrt({ output, ...nrm }) : null;
    if (pics) { sp.setMRT(ownBlend(pics, Object.keys(nrm))); slimPictures(sp, { normals: !!nrm.normal, motion: mrtOn || mbOn }); }
    // (what reads the normals reads them through this: ambient occlusion and its smoothing, bounce light, reflections)
    this.nrmN = nrm.normal ? sceneNormals(sp) : null;
    const U = this.U;
    let colT = sp.getTextureNode('output');
    // (OIT: the see-through things are blended over the scene by the pass node itself, so that's what's read on)
    if (oitOn) colT = rtt(sp, null, null, { type: HalfFloatType, depthBuffer: false });
    // live bounce light (v.liveBounce, high and ultra): light bounced off walls and floors onto what's
    // near them, worked out each frame, so it follows a moving sun, a lamp switched on, a door opened.
    // 'screen': three's SSGI (what's on screen bounces); 'voxel': three's VXGI (the level as voxels, light
    // traced through them in cones: off-screen walls count too, the level's shape built once).
    // (its noise is the same every frame: no pass right after it averages a changing one over frames)
    if (giOn && aoOn) {
      const dN = sp.getTextureNode('depth'), nN = this.nrmN, dif = sp.getTextureNode('diffuse'), C = colT;
      let g;
      if (giOn === 'voxel') {
        const n = this.giN = vxgi(dN, nN, this.scene, this.cam, this.giRes || 64); n.useTemporalFiltering = false; n.bounces = 1;
        if (this.giBox) n.volume.bounds.copy(this.giBox);
        n.volume.layers.enable(OCC_LAYER);   // (what the camera's occlusion culling hides this frame is still part of the level)
        const gi = n.getGINode(), vao = n.getAONode();
        g = Fn(() => vec4(C.sample(uv()).rgb.mul(mix(float(1), vao.sample(uv()).r, .5)).add(dif.sample(uv()).rgb.mul(gi.sample(uv()).rgb).mul(U.giK)), 1))();
      } else {
        const n = this.giN = ssgi(C, dN, nN, this.cam); n.useTemporalFiltering = false;
        n.sliceCount.value = 3; n.stepCount.value = 8; n.radius.value = 6; n.giIntensity.value = 4; n.aoIntensity.value = 0;
        const gt = n.getGINode();
        g = Fn(() => vec4(C.sample(uv()).rgb.add(dif.sample(uv()).rgb.mul(gt.sample(uv()).rgb).mul(U.giK)), 1))();
      }
      this.giT = rtt(g, 1, 1, { type: HalfFloatType, depthBuffer: false }); colT = this.giT; this.giT.renderTarget.gsPart = 'bounce light';
    }
    // reflections: three's screen-space reflections on the things the game marked, added to the scene's colour
    // (after the bounce light, before the ambient occlusion and everything else the chain does to the picture)
    if (reflOn) colT = tr ? TR.traceStage(this, sp, colT, tr) : reflStage(this, sp, colT);
    let lit = colT.rgb, aoF = float(1);
    if (aoOn) {
      this.aoN = ao(sp.getTextureNode('depth'), this.nrmN, this.cam);
      Object.assign(this.aoN, { resolutionScale: 1 });
      this.aoN.radius.value = .6; this.aoN.distanceExponent.value = 1.4; this.aoN.thickness.value = 1.2; this.aoN.scale.value = 1.1; this.aoN.samples.value = 12;
      // (WebGL's GTAOPass smooths its own noise; here three's denoise does it)
      this.dnN = denoise(this.aoN.getTextureNode(), sp.getTextureNode('depth'), this.nrmN, this.cam);
      this.dnN.noiseNode = texture(denoiseNoise());   // (the same noise for every view and every run: denoiseNoise above)
      // smoothed once, at the ambient occlusion's own size (half the picture on high), into a picture of its own, as WebGL's
      // GTAOPass does. three's denoise is worked out where it is used: 16 reads each of the occlusion, the depth and the
      // normals for every pixel of the full picture in the finishing pass, and again in the bloom's first pass. On the
      // Fold the finishing pass was the chip's biggest (2.6 ms of 9.3 in the town, 2026-11-13); the picture is read
      // back with one smooth read where the occlusion is laid on
      this.dnT = rtt(vec4(this.dnN.r, 0, 0, 1), null, null, { depthBuffer: false, type: UnsignedByteType, format: RedFormat });
      this.dnT.renderTarget.gsPart = 'ao';
      aoF = mix(float(1), this.dnT.r, clamp(sp.getTextureNode('normal').a, 0, 1).oneMinus().mul(.9)); lit = lit.mul(aoF);
    }
    let src = colT, srcAo = aoF;
    const V = this.V, dT = sp.getTextureNode('depth');
    // volumetric light (v.beams; hd3d.js VOL): the lit air along each view ray at half size, softened and added on
    if (volOn) {
      const shT = this.volShadow = texture(NO_SHADOW);
      this.volT = rtt(Fn(() => {
        const q = uv(), d = dT.sample(q).r, vp = getViewPosition(q, d, V.invProj), wp = V.camWorld.mul(vec4(vp, 1)).xyz;
        const rd0 = wp.sub(V.camPos), L0 = length(rd0), rd = rd0.div(max(L0, 1e-4)).toConst();
        const L = select(d.greaterThanEqual(1), V.k.y, min(L0, V.k.y)).toConst(), dt = L.div(V.steps).toConst();
        const t = dt.mul(interleavedGradientNoise(screenCoordinate)).toVar(), sum = float(0).toVar(), g = V.k.z, spot = V.lt.x.greaterThan(.5);
        Loop({ start: 0, end: VOL_MAX }, ({ i }) => {
          If(float(i).greaterThanEqual(V.steps), () => { Break(); });
          const p = V.camPos.add(rd.mul(t)), s4 = V.shM.mul(vec4(p, 1)), sc = s4.xyz.div(s4.w);
          const inside = s4.w.greaterThan(0).and(sc.x.greaterThanEqual(0)).and(sc.x.lessThanEqual(1)).and(sc.y.greaterThanEqual(0)).and(sc.y.lessThanEqual(1)).and(sc.z.greaterThanEqual(0)).and(sc.z.lessThanEqual(1));
          const sh = shT.sample(vec2(sc.x, sc.y.oneMinus())).compare(sc.z).r;
          const q0 = p.sub(V.lPos), dl = length(q0), qn = q0.div(max(dl, 1e-4));
          const cone = smoothstep(V.lt.y, V.lt.z, dot(qn, V.lDir)).div(dl.mul(dl).div(V.lt.w.mul(V.lt.w)).add(1));
          const lit = select(inside.and(V.k.w.greaterThan(.5)), sh, float(1)).mul(select(spot, cone, float(1)));
          const c = dot(rd, select(spot, qn.negate(), V.lDir.negate()));
          sum.addAssign(lit.mul(g.mul(g).oneMinus()).div(pow(g.mul(g).add(1).sub(g.mul(2).mul(c)), 1.5)).mul(.25)); t.addAssign(dt);
        });
        return vec4(exp(V.k.x.negate().mul(L).mul(sum).div(V.steps)).oneMinus(), 0, 0, 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      const volT = this.volT, vpx = this.volPx = uniform(new Vector2(1, 1)); volT.renderTarget.gsPart = 'volumetric light';
      this.baseT = rtt(Fn(() => {
        const q = uv(), a = volT.sample(q.add(vpx.mul(vec2(-1, -1)))).r.add(volT.sample(q.add(vpx.mul(vec2(1, -1)))).r)
          .add(volT.sample(q.add(vpx.mul(vec2(-1, 1)))).r).add(volT.sample(q.add(vpx.mul(vec2(1, 1)))).r);
        return vec4(colT.sample(q).rgb.mul(aoF).add(V.tint.mul(a.mul(.25))), 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      src = this.baseT; srcAo = float(1);   // (this full-size mix, which also lays the ambient occlusion on, counts as 'effects')
    }
    // depth of field (v.focus; the views turn it on once they use it, so focusing doesn't rebuild the
    // chain): what's in focus stays, the rest is blurred by up to lens.w pixels, into a picture of its own
    if (dofOn) {
      const cn = U.cn, cf = U.cf, L = U.lens, S = src, SA = srcAo;
      const dist = q => { const z = dT.sample(q).x; return select(z.greaterThanEqual(1), float(0), cn.mul(cf).div(cf.sub(z.mul(cf.sub(cn))))); };
      const coc = z => select(z.lessThanEqual(0), float(0), clamp(abs(z.sub(L.x)).sub(L.y).div(max(L.x.mul(L.z), 1e-3)), 0, 1));
      const dof = Fn(() => {
        const q = uv(), base = S.sample(q).rgb, z = dist(q), c = coc(z), out = vec3(base).toVar();
        If(c.mul(L.w).greaterThanEqual(.5), () => {
          const sum = vec3(base).toVar(), ws = float(1).toVar();
          for (let i = 1; i < 16; i++) {
            const r = Math.sqrt(i / 15), a = i * 2.39996, o = vec2(Math.cos(a) * r, Math.sin(a) * r).mul(c.mul(L.w)).mul(U.px);
            const zs = dist(q.add(o)), w = select(zs.greaterThan(0).and(zs.lessThan(z)), coc(zs), float(1));   // a sharp thing in front doesn't smear over a soft background
            sum.addAssign(S.sample(q.add(o)).rgb.mul(w)); ws.addAssign(w);
          }
          out.assign(sum.div(ws));
        });
        return vec4(out.mul(SA), 1);
      })();
      this.dofT = rtt(dof, 1, 1, { depthBuffer: false, type: HalfFloatType }); src = this.dofT; srcAo = float(1); this.dofT.renderTarget.gsPart = 'depth of field';
    }
    // motion blur (v.motionBlur; hd3d.js MB): each pixel smeared along its move on screen as the camera moved
    if (mbOn) {
      const S = src, SA = srcAo, mb = V.mb, velT = sp.getTextureNode('velocity'), MBT = this.mbTilePx = uniform(new Vector2(1, 1));
      // each thing's move on screen (three's velocity picture, in screen units), at most mb.y of the width
      const moveAt = q => { const v = velT.sample(q).xy.mul(vec2(.5, -.5)).mul(mb.x), l = length(v.mul(vec2(mb.w, 1))), mx = mb.y.mul(mb.w); return select(l.greaterThan(mx), v.mul(mx.div(max(l, 1e-6))), v); };
      // the fastest move in each 16 x 16 block (4 x 4 looks), so a fast thing smears out over what's behind it
      // (McGuire et al.'s tile max, simplified)
      this.mbTile = rtt(Fn(() => {
        const q = uv(), best = vec2(0).toVar();
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const v = moveAt(q.add(MBT.mul(vec2((i + .5) / 4 - .5, (j + .5) / 4 - .5)))); If(dot(v, v).greaterThan(dot(best, best)), () => { best.assign(v); }); }
        return vec4(best, 0, 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      const tileT = this.mbTile;
      this.mbT = rtt(Fn(() => {
        const q = uv(), base = S.sample(q).rgb.mul(SA), d = dT.sample(q).r, vp = getViewPosition(q, d, V.invProj);
        const near = select(d.greaterThanEqual(1), float(1), smoothstep(mb.z, mb.z.mul(1.5).add(.01), vp.z.negate()));   // (mb.z: things this close stay sharp)
        // the camera's move only (WebGL's way, and the frame after a cut)
        const pc = V.prevVP.mul(V.camWorld.mul(vec4(vp, 1))), pn = pc.xy.div(max(pc.w, 1e-4)), pu = vec2(pn.x.mul(.5).add(.5), pn.y.mul(-.5).add(.5));
        const v0 = q.sub(pu).mul(mb.x), l = length(v0.mul(vec2(mb.w, 1))), mx = mb.y.mul(mb.w);
        const vel = select(pc.w.lessThanEqual(0), vec2(0), select(l.greaterThan(mx), v0.mul(mx.div(max(l, 1e-6))), v0).mul(near));
        let sum = vec3(0);
        for (let i = 0; i < MB_N; i++) sum = sum.add(S.sample(q.add(vel.mul(i / (MB_N - 1) - .5))).rgb);
        const camOnly = select(length(vel.div(U.px)).lessThan(.75), base, sum.mul(SA).div(MB_N));
        // per thing (V.mbObj): smear along the fastest move nearby; samples of something moving that fast
        // count, still ones give this pixel's own colour, so a ball flying past blurs over the sky behind
        // it while the sky itself stays put
        const tq = floor(q.div(MBT)).add(.5), dom = vec2(0).toVar();
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const v = tileT.sample(tq.add(vec2(i, j)).mul(MBT)).xy; If(dot(v, v).greaterThan(dot(dom, dom)), () => { dom.assign(v); }); }
        const dv = dom.mul(near), dl2 = dot(dv, dv).mul(.25);
        let acc = vec3(0);
        for (let i = 0; i < MB_N; i++) {
          const p = q.add(dv.mul(i / (MB_N - 1) - .5)), sv = moveAt(p);
          acc = acc.add(select(dot(sv, sv).greaterThanEqual(dl2), S.sample(p).rgb.mul(SA), base));
        }
        const perThing = select(length(dv.div(U.px)).lessThan(.75), base, acc.div(MB_N));
        return vec4(select(V.mbObj.greaterThan(.5), perThing, camOnly), 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      src = this.mbT; srcAo = float(1); this.mbT.renderTarget.gsPart = this.mbTile.renderTarget.gsPart = 'motion blur';
    }
    // gs.fx3d's screen effects (outline, glitch, trails, pixelate), in the order the game added them
    if (this.fxSlots.length) { src = fxStages(this, src, aoOn && srcAo === aoF ? srcAo : null, U); srcAo = float(1); }
    // sun shafts (v.shafts): the bright sky near the sun at quarter size, smeared towards the sun, added on top
    let shafts = vec3(0);
    if (shaftsOn) {
      this.shM = rtt(Fn(() => {
        const q = uv(), c0 = src.sample(q).rgb.mul(srcAo), l0 = dot(c0, LUM), k = q.sub(U.sunUV).mul(vec2(U.aspect, 1));
        const l = min(l0, U.shCap), c = c0.mul(l.div(max(l0, 1e-6))).mul(U.shGain);
        return vec4(c.mul(smoothstep(U.shThr, U.shHi, l)).mul(exp(dot(k, k).mul(-3))), 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      const shM = this.shM;
      this.shB = rtt(Fn(() => {
        const q = uv(), dd = q.sub(U.sunUV).mul(.9 / 24); let sum = vec3(0), w = 1;
        for (let i = 1; i <= 24; i++) { sum = sum.add(shM.sample(q.sub(dd.mul(i))).rgb.mul(w)); w *= .955; }
        return vec4(sum.div(24).mul(2.2), 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      shafts = this.shB.sample(screenUV).rgb.mul(U.shaftTint).mul(U.shaft); this.shM.renderTarget.gsPart = this.shB.renderTarget.gsPart = 'light shafts';
    }
    if (src !== colT || shaftsOn) lit = src.sample(screenUV).rgb.mul(srcAo).add(shafts);
    this.bloomN = bloomChain(src, srcAo); this.bloomK = uniform(.56);
    const uv0 = screenUV, d = uv0.sub(.5), r2 = dot(d, d), half = halfWanted();
    const graded = Fn(() => {
      const uv = uv0;
      // smooth: with FXAA on (below) no fringe; otherwise a touch of lens fringing at the edges
      let col = smooth ? lit : vec3(src.sample(uv.add(d.mul(r2).mul(.012))).r.mul(srcAo).add(shafts.r), lit.g, src.sample(uv.sub(d.mul(r2).mul(.012))).b.mul(srcAo).add(shafts.b));
      // bloom
      col = col.add(this.bloomN.out.mul(this.bloomK));
      // lens flare (v.flare): three's LensflareNode over the bloom, and the lens dirt lit by it (hd3d.js FINAL_EFFECTS flare)
      if (flareOn) {
        const F = this.F, bl = this.bloomN.out.mul(this.bloomK);
        this.flareN = lensflare(vec4(bl, 1), { ghostTint: F.tint, threshold: F.th, ghostSamples: 4, ghostSpacing: F.sp, ghostAttenuationFactor: F.fade });
        const fl = this.flareN.rgb, asp = U.aspect, du = uv.sub(.5).mul(vec2(min(asp, 1), min(float(1).div(asp), 1))).add(.5);
        col = col.add(fl.mul(F.k)).add(F.dirt.sample(du).rgb.mul(bl.add(fl)).mul(F.dk));
      }
      // grade (v.grade) and sun glare (v.glare), only while the sun itself shows (how much: five reads round it, made
      // only while there is glare: the same for every pixel, so the chip skips them all together)
      const su = U.sunUV, tap = o => colT.sample(su.add(o)).rgb, seen = float(0).toVar();
      If(U.glare.greaterThan(0), () => {
        const s0 = tap(vec2(0, 0)).add(tap(vec2(.006, 0))).add(tap(vec2(-.006, 0))).add(tap(vec2(0, .008))).add(tap(vec2(0, -.008)));
        seen.assign(smoothstep(1.5, 6, dot(s0, LUM).mul(.2)));
      });
      return GRADE({ col, sat: U.sat, con: U.con, lo: U.lo, hi: U.hi, on: U.gradeOn, uv, su, aspect: U.aspect, seen, sunCol: U.sunCol, glare: U.glare }, half);
    })();
    // tone mapping (ACES, the renderer's exposure) and sRGB (named outright under SGSR 2 and 1: drawn outside the pipeline)
    let out = s2 || s1 ? renderOutput(vec4(graded, 1), TM, SRGBColorSpace) : renderOutput(vec4(graded, 1));
    // colour look (v.lut): three's 3D lookup table node, on the finished screen colours (hd3d.js FINAL_EFFECTS lut)
    this.lutN = null;
    if (lutOn) out = this.lutN = lut3D(vec4(clamp(out.rgb, 0, 1), 1), texture3D(NO_LUT), 2, this.U.lutK);
    if (smooth) out = fxaa(out);
    // HDR screens: the picture up to paper white as on any screen, and what's brighter than white in the
    // scene (the sun, glows, sparks, glints, bloom) goes past it, up to the screen's headroom, instead of
    // stopping at white. A soft knee on how far past white the light is, so it eases in
    if (this.r.gsHdr) {
      const U = this.U, over = max(dot(graded, LUM).mul(U.hdrExp).sub(1), 0);
      out = vec4(out.rgb.mul(float(1).add(U.hdrK.mul(float(1).sub(exp(over.mul(-.6)))))), 1);
    }
    // live, the last touches go on as each refresh is shown (show()), not here
    const fin = live ? vec4(out.rgb, 1) : Fn(() => vec4(touches(U, out.rgb, U.t, float(1)), 1))();
    if (s2) { this.s2 = sgsr2Gpu(fin, sp.getTextureNode('depth'), mrtOn ? { vel: sp.getTextureNode('velocity'), rea: sp.getTextureNode('reactive') } : null, s2 !== 'plain'); return; }
    if (s1) this.s1 = sgsr1Gpu(fin);
    this.pp.outputNode = s1 ? this.s1.node : fin; this.pp.needsUpdate = true;
  }
  // What a shader built in the background is built for: a small picture laid out as the scene pass's own (how many
  // pictures, their formats, samples a pixel, a depth picture) and what the pass writes into them. three keeps a
  // material's shader and its pipeline by that layout, not by the picture itself: built for anything else (the screen,
  // as it used to be), the pass found neither and built both in the frame the thing first drew, which is the long
  // frame the build was sent to the background to avoid. (Not the pass's own picture: it is still being read.)
  // null until the pass has been built.
  buildFor() {
    const sp = this.sp, rt = sp?.renderTarget; if (!rt) return null;
    let sig = rt.samples + '|' + rt.depthBuffer + '|' + rt.stencilBuffer + '|' + (rt.depthTexture ? rt.depthTexture.format + ':' + rt.depthTexture.type : '');
    for (const t of rt.textures) sig += '|' + t.format + ':' + t.type + ':' + t.colorSpace;
    const b = this._bf;
    if (b?.sig !== sig) {
      // (made afresh, not rt.clone(): a copy's pictures share the pass's own image sizes, and sizing the copy shrank the pass's)
      b?.rt.dispose();
      const c = new RenderTarget(4, 4, { count: rt.textures.length, samples: rt.samples, depthBuffer: rt.depthBuffer, stencilBuffer: rt.stencilBuffer });
      rt.textures.forEach((t, i) => { const q = c.textures[i]; q.format = t.format; q.type = t.type; q.colorSpace = t.colorSpace; q.name = t.name; q.generateMipmaps = false; });
      if (rt.depthTexture) { const d = new DepthTexture(4, 4, rt.depthTexture.type); d.format = rt.depthTexture.format; c.depthTexture = d; }
      this._bf = { sig, rt: c, mrt: null };
    }
    this._bf.mrt = sp.getMRT?.() ?? null;
    return this._bf;
  }
  /** Sets the numbers from the view and tier, then draws. o: { ao (AO resolution, 0 = off), msaa, bloomScale, smooth, bloom, t, hurt, grade, glare, sunUV, sunCol, aspect,
   *  fg (frame generation: { mode: 'blend' | 'ahead', reset, jd: SGSR 2's jitter change in NDC }) }. With fg, returns what it showed ('real' | 'made'). */
  render(o) {
    // o.s2: SGSR 2's frame numbers (sgsr2.js SgsrFrame): the scene and effects at o.w x o.h, upscaled to o.fw x o.fh
    // (o.s2Plain: Qualcomm's shader as it was, without our changes: see sgsr2Gpu);
    // o.s1: the same sizes, upscaled by SGSR 1. o.live: the game on screen (drawn into a picture and shown);
    // o.mrt: the scene's pass also writes motion and the see-through mask (frame generation, SGSR 2)
    const f = !this.clear && o.s2 ? o.s2 : null, s1 = !f && !!o.s1, live = !!o.live;
    DRAWN.n++;
    if (o.gi) { this.giRes = o.gi.res; this.giBox = o.gi.box; }
    // gs.fx3d's screen effects and reflections have a key of their own: the chain is built again when it changes
    // (ray traced reflections: built again too when the traced level's lists on the chip are made anew, bigger)
    { const tr = o.refl?.traced || null, xk = this.clear ? '' : fxPlan(this, o.fx) + (o.refl ? (tr ? '|traced' + tr.gen + (tr.show ? 's' : '') : '|refl') : ''); this.reflOn = !!o.refl; this.tracer = tr; if (xk !== this.xKey) { this.xKey = xk; this.key = ''; } }
    this.build(!this.clear && o.ao > 0, !!o.smooth && !f, o.msaa, f ? (o.s2Plain ? 'plain' : true) : false, !this.clear && !!o.dofOn, !this.clear && !!o.shaftsOn, live, s1, !this.clear && !!o.volOn, !this.clear && !!o.mbOn, !!o.mrt, o.tone, !this.clear && !!o.lut, !this.clear && !!o.oit, !this.clear && !!o.flare, !this.clear && o.ao > 0 && o.gi ? o.gi.kind : false);
    if (this.s1) this.s1.size(o.w, o.h);
    // the passes size themselves from the canvas: upscaled, the canvas is the screen's size, so scale them down
    const k = f || s1 ? (o.w + .5) / o.fw : 1;
    if (this.sp.getResolutionScale() !== k) this.sp.setResolutionScale(k);
    if (!this.clear) {
      const U = this.U;
      if (this.aoN && this.aoN.resolutionScale !== o.ao * k) { this.aoN.resolutionScale = o.ao * k; this.dnT.setResolutionScale(o.ao * k); }
      this.bloomK.value = Math.max(0, o.bloom) * .8; this.bloomN.size(o.w, o.h, o.bloomScale || .5);
      U.t.value = o.t; U.hurt.value = o.hurt; U.grain.value = o.grain ?? .035;
      if (this.r.gsHdr) { U.hdrK.value = Math.max(0, (o.headroom ?? 2) - 1); U.hdrExp.value = this.r.toneMappingExposure; }
      const g = o.grade; U.gradeOn.value = g ? 1 : 0;
      if (g) { U.sat.value = g.sat; U.con.value = g.con; U.lo.value.copy(g.lo); U.hi.value.copy(g.hi); }
      if (this.giT) this.giT.setSize(o.w, o.h);
      if (o.gi) { U.giK.value = o.gi.strength; if (o.gi.rebuild && this.giN?.volume) this.giN.needsUpdate = true; }
      U.glare.value = o.glare; U.sunUV.value.set(o.sunUV.x, 1 - o.sunUV.y); U.sunCol.value.copy(o.sunCol); U.aspect.value = o.aspect;
      U.px.value.set(1 / o.w, 1 / o.h);
      // (o.fxK: the effects hd3d.js's ladder draws smaller by their cost, FXS; only picture sizes change)
      const fk = o.fxK || NO_FXK, rs = o.refl ? o.refl.scale * fk.reflections : 0;
      fxFrame(this, o.w, o.h, k); if (o.refl) { reflFrame(this, o.w, o.h, rs * k); if (this.tracer) TR.traceFrame(this, o.w, o.h, rs); }
      if (o.flare) { const F = this.F, f = o.flare; F.tint.value.copy(f.tint); F.th.value = f.threshold; F.sp.value = f.spacing; F.fade.value = f.fade; F.k.value = f.strength; F.dk.value = f.dirt; F.dirt.value = f.dirtTex; }
      if (this.lutN) { this.lutN.lutNode.value = o.lut; this.lutN.size.value = o.lut.image.width; U.lutK.value = Math.min(1, o.lutK ?? 1); }
      if (this.dofT) { this.dofT.setSize(o.w, o.h); const L = o.lens; U.lens.value.set(L ? L[0] : 0, L ? L[1] : 0, L ? L[2] : 0, L ? L[3] : 0); U.cn.value = o.near; U.cf.value = o.far; }
      const V = this.V, cam = this.cam;
      if (this.volT || this.mbT) { V.invProj.value.copy(cam.projectionMatrixInverse); V.camWorld.value.copy(cam.matrixWorld); }
      if (this.volT) {
        const m = o.vol, vk = (o.fxK || NO_FXK).vol; this.volT.setSize(Math.max(8, Math.round(o.w / 2 * vk)), Math.max(8, Math.round(o.h / 2 * vk))); this.baseT.setSize(o.w, o.h);
        this.volPx.value.set(1 / this.volT.renderTarget.width, 1 / this.volT.renderTarget.height);
        if (m) {
          this.volShadow.value = m.map || NO_SHADOW; if (m.shadowM) V.shM.value = m.shadowM; cam.getWorldPosition(V.camPos.value);
          V.lDir.value.copy(m.lDir); V.lPos.value.copy(m.lPos); V.lt.value.copy(m.lt); V.k.value.set(m.density, m.far, m.g, m.map ? 1 : 0); V.steps.value = m.steps; V.tint.value.copy(m.tint);
        } else { V.tint.value.setRGB(0, 0, 0); V.steps.value = 1; }
      }
      if (this.mbT) { this.mbT.setSize(o.w, o.h); { const tw = Math.max(1, Math.ceil(o.w / 16)), th = Math.max(1, Math.ceil(o.h / 16)); this.mbTile.setSize(tw, th); this.mbTilePx.value.set(1 / tw, 1 / th); } const m = o.mb; if (m) { V.prevVP.value.copy(m.prevVP); V.mb.value.copy(m.mb); V.mbObj.value = m.obj; } else V.mb.value.set(0, 0, 0, 1); }
      if (this.shM) { const sk = (o.fxK || NO_FXK).shafts, bw = Math.max(8, Math.round(o.w / 4 * sk)), bh = Math.max(8, Math.round(o.h / 4 * sk)); this.shM.setSize(bw, bh); this.shB.setSize(bw, bh); U.shaft.value = o.shaft || 0; if (o.shaftCol) U.shaftTint.value.copy(o.shaftCol);
        const t = Math.max(1.1, o.shaftAt ?? 1.1), lit = t > 1.1; U.shThr.value = t; U.shHi.value = lit ? t * 1.2 : t * 2.2; U.shCap.value = lit ? t * 1.2 : 1e9; U.shGain.value = 1.1 / t; }
    }
    // (ray traced reflections: the first frames with new lists on the chip are a trial; a chip that won't take them goes back to screen-space ones)
    if (this.tracer?.trial > 0) return this.tracer.tried(() => this.present(o, f, live));
    return this.present(o, f, live);
  }
  present(o, f, live) {
    if (live) return this.realFrame(o, f);
    if (this.s2) { this.s2.size(o.w, o.h, o.fw, o.fh); this.s2.set(f); this.s2.render(this.r); }
    else this.pp.render();
  }

  /* ---------- the game on screen: real frames, made frames, still frames ---------- */
  // Each real frame is drawn into a picture (SGSR 2's own, or one of ours) and shown by a copy that adds
  // the last touches. With frame generation (o.fg: { mode, pace, quick, parts, cost, reset, jd, jit, steps, hz }),
  // every refresh shows a moment on an even beat: t = 1 + (k - D) / gap, k refreshes after the newest real
  // frame, which came gap refreshes after the last one. blend shows each moment D refreshes late, so every
  // moment is between two real frames; ahead (D = 0) shows the newest real frame on its own refresh and
  // guesses past it after. That covers two, three or four refreshes per real frame, and a screen that isn't
  // a whole multiple (60 fps on 90 Hz: one or two). The refreshes between are the ones the feed skips
  // (src/main.js, speed.between).
  // blend's pace: 'after' (D = 1 at twice the game's rate, 2 at three times...) makes a frame on the real
  // frame's own refresh, so that refresh holds both (the least delay, for a phone with room for both);
  // 'first' (D = the refreshes per real frame) shows the last real frame on that refresh and makes every
  // frame on the refreshes between, so no refresh holds more than one frame's work, a refresh later. A
  // refresh's picture reaches the screen only once all the work sent in it is done (one queue on the
  // chip), so what counts is the work in each refresh, not in each pair.
  realFrame(o, f) {
    const r = this.r, sp = this.sp, fgo = o.mrt ? o.fg : null, cam = this.cam;
    if (!fgo && this.fg?.frames) { this.fg.reset(); this.sched = null; }
    // the last pair's newest frame becomes the next pair's last (when no refresh between did it)
    if (fgo && this.owe && !fgo.reset) this.fg.keep();
    this.owe = false;
    // particles' own motion is measured from the camera as the last real frame drew it
    fgPrevVP.value.copy(this.vpLast ||= cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse));
    // the frame's picture, and the last frame's: two pictures taking turns (SGSR 2's own two, or ours), so
    // frame generation reads the last frame where it is instead of copying a screen-sized picture every frame
    let color, before;
    if (this.s2) { this.s2.size(o.w, o.h, o.fw, o.fh); this.s2.set(f); this.s2.render(r, false); color = this.s2.last(); before = this.s2.before(); }
    else {
      // (the second picture only once frame generation runs for this view)
      const mk = () => new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false }), two = this.fgRT ||= [mk()];
      if (fgo && two.length < 2) two.push(mk());
      const turn = two.length > 1 ? (this.fgTurn ^= 1) : 0, rt = two[turn]; before = two.length > 1 ? two[turn ^ 1].texture : null;
      for (const t of two) if (t.width !== o.fw || t.height !== o.fh) t.setSize(o.fw, o.fh);
      const was = r.getRenderTarget(); r.setRenderTarget(rt);
      try { this.pp.render(); } finally { r.setRenderTarget(was); }
      color = rt.texture;
    }
    this.vpLast.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.lastColor = color;
    if (o.still) (this.still ||= new StillCheck(r)).check(color, o.fw, o.fh);
    if (!fgo) { this.fgMode = null; this.showFrame(color, null); return 'real'; }
    const fg = this.fg ||= new FrameGen(r);
    const mode = fgo.mode === 'ahead' ? 'ahead' : 'blend';
    if (fgo.reset || mode !== this.fgMode) { fg.reset(); this.sched = null; }
    this.fgMode = mode; fg.parts = !!fgo.parts; fg.U.quick.value = fgo.quick === false ? 0 : 1; this.cost = fgo.cost || null; this.drop = fgo.drop !== false;
    const vel = sp.getTexture('velocity');
    this.U.gk.value = vel.image.width / o.fw;
    // (the picture is tone mapped and in sRGB by now: in 0..1 unless the screen is HDR, where it goes past white)
    fg.real({ color, prevColor: before, eightBit: !r.gsHdr, velocity: vel, reactive: sp.getTexture('reactive'), depth: sp.getTextureNode('depth').value,
      renderSize: [vel.image.width, vel.image.height], outputSize: [o.fw, o.fh], camera: cam, jitter: fgo.jit, jitterDelta: fgo.jd });
    // the gap since the last real frame, in refreshes as the screen saw them (one that can't be a refresh
    // count, like a test's slow frames, counts as the usual one)
    const S = this.sched, steps = Math.max(1, fgo.steps || 2), ms = 1000 / (fgo.hz || 120);
    let gap = S ? Math.round((o.now - S.at) / ms) : 0;
    if (!(gap >= 1 && gap <= 6)) gap = Math.max(1, Math.round(steps));
    if (S) { this.fgWin.real++; if (S.k < gap - 1) this.fgWin.missed++; }   // refreshes in that gap showed nothing new
    const n = Math.max(1, Math.ceil(steps - .01)), first = mode === 'blend' && fgo.pace === 'first';
    this.sched = { at: o.now, ms, gap, k: 0, first, D: mode === 'ahead' ? 0 : first ? n : Math.max(1, n - 1) };
    this.owe = true;
    // fresh aim: where the input pointed the camera for this frame (a later change is the finger's own)
    const base = this.aim && fg.ready ? this.aim() : null; if (base) copyPose(base, this.aimBase);
    return this.showAt(0);
  }
  // the moment due k refreshes after the newest real frame: the newest, the last, or a made one
  showAt(k) {
    const S = this.sched, fg = this.fg, t = 1 + (k - S.D) / S.gap;
    if (!fg.ready || Math.abs(t - 1) < .02) { this.showFrame(this.lastColor, 1); return 'real'; }
    // (first: the real frame's own refresh only ever shows the last real frame, even after a late one)
    if (t < .02 || (S.first && k === 0)) { this.showFrame(fg.prev, 0); return 'real'; }
    if (t > 2.6) return false;   // too far past the newest to guess: the screen keeps what it has
    fg.make(t); this.showFrame(fg.output, t); return 'made';
  }
  /**
   * A refresh after a real frame (the feed's skipped refresh): shows the moment due then. last: the next
   * refresh draws a real frame (so the newest is kept now, on this lighter refresh); now: this refresh's
   * time (the animation frame's), so a refresh the phone skipped (a busy moment) doesn't hold the picture
   * back a step, which then jumps when the next real frame comes (stop and go). Returns 'real' | 'made' | false.
   */
  between(last = true, now = null) {
    const S = this.sched; if (!S || !this.fg) return false;
    S.k = refreshesSince(S, now);
    // a made frame that can't be ready for the refresh after this one (the chip still on the real frame) is
    // dropped: the screen keeps what it shows, and the next real frame isn't held up behind it
    if (this.drop && this.dueMade(S) && this.late(now)) { this.fgWin.dropped++; this.drops = (this.drops || 0) + 1; return false; }
    const shown = this.showAt(S.k);
    if (shown === 'made') this.fgWin.made++;
    if (last && this.owe) { this.fg.keep(); this.owe = false; }
    return shown;
  }
  // the moment due at refresh S.k is one to make (not the newest or the last real frame, nor too far past to guess)
  dueMade(S) { const t = 1 + (S.k - S.D) / S.gap; return this.fg.ready && Math.abs(t - 1) >= .02 && t >= .02 && t <= 2.6 && !(S.first && S.k === 0); }
  /**
   * Whether a frame made now would miss the next refresh: the chip hasn't finished the newest real frame (sent()),
   * and by the chip's times (this.cost, ms: { real, made }) it won't be free in time to make one too. Without the
   * chip's times (a phone that doesn't tell them) nothing is dropped: hd3d.js's miss check decides.
   */
  late(now) {
    const d = this.realDone, c = this.cost;
    if (!d || d.done || now == null || !(c?.real > 0) || !(c.made > 0)) return false;
    const free = Math.max(now, d.sent, d.start + c.real);
    return free + c.made > now + d.rf * .9;
  }
  /** After a real frame's work is all sent (drawGPU's end): start is when its drawing began, rf the screen's refresh in ms. */
  sent(start, rf) {
    const dev = this.r.backend?.device; if (!dev?.queue?.onSubmittedWorkDone || !this.sched) { this.realDone = null; return; }
    const d = this.realDone = { start, sent: performance.now(), rf, done: false };
    dev.queue.onSubmittedWorkDone().then(() => { d.done = true; }, () => { d.done = true; });
  }
  /** Shows the last real frame again (a still scene that isn't drawn this refresh). */
  showLast() { if (!this.lastColor) return false; this.warp.value.identity(); this.show(this.lastColor); return true; }
  /**
   * Since it was last asked: miss, how often out of the real frames the refresh between them didn't come; dropped,
   * the share of the frames due to be made that were dropped as late (both 0..1). Then starts counting again.
   */
  missRate() {
    const w = this.fgWin, out = { miss: w.real ? w.missed / w.real : 0, dropped: w.made + w.dropped ? w.dropped / (w.made + w.dropped) : 0 };
    w.real = w.missed = w.made = w.dropped = 0; return out;
  }
  // a frame onto the screen; with fresh aim (this.aim: the camera's pose now, from the newest input), turned
  // from the camera it was made for (the moment t) to where the camera points now. Only while the input is
  // turning the camera between real frames (a finger looking round, the phone turning in AR): a turn the
  // game makes in its update (a stick held over) is followed by the made frames' own motion instead.
  showFrame(tex, t) {
    const fresh = this.aim && t != null && this.fg?.ready ? this.aim() : null, now = performance.now(), B = this.aimBase;
    if (fresh && (fresh.q.angleTo(B.q) > 1e-5 || Math.abs(fresh.fx - B.fx) > 1e-6 * Math.abs(B.fx))) this.aimAt = now;
    if (fresh && now - this.aimAt < AIM_HOLD) homography(fresh, this.fg.poseAt(t, AIM_POSE), this.warp.value); else this.warp.value.identity();
    this.show(tex);
  }
  // a picture onto the screen (already tone mapped and in sRGB), with the last touches (AR: as it is, see-through)
  show(tex) {
    if (!this.showQ) {
      const m = new NodeMaterial(), T = this.showT = texture(tex), U = this.U, at = warpUV(screenUV, this.warp); m.name = 'Frame gen show';
      m.fragmentNode = this.clear ? T.sample(at) : Fn(() => vec4(touches(U, T.sample(at).rgb, U.gt, U.gk), 1))();
      this.showQ = new QuadMesh(m);
    }
    this.showT.value = tex; this.U.gt.value = (this.U.gt.value + .37) % 10;
    const r = this.r, tm = r.toneMapping, cs = r.outputColorSpace; r.toneMapping = NoToneMapping; r.outputColorSpace = LinearSRGBColorSpace;
    try { r.setRenderTarget(null); this.showQ.render(r); } finally { r.toneMapping = tm; r.outputColorSpace = cs; }
  }
  dispose() {
    this.aoN?.dispose?.(); this.dnN?.dispose?.(); this.dnT?.renderTarget?.dispose(); this.bloomN?.dispose?.(); this.s2?.dispose(); this.s1?.dispose(); this.dofT?.renderTarget?.dispose(); this.shM?.renderTarget?.dispose(); this.shB?.renderTarget?.dispose(); for (const t of [this.volT, this.baseT, this.mbT]) t?.renderTarget?.dispose(); this.pp.dispose?.();
    fxDispose(this); reflDispose(this); TR?.traceDispose(this);
    this.fg?.dispose(); this.still?.dispose(); for (const t of this.fgRT || []) t.dispose(); this.showQ?.material.dispose(); this.fg = this.still = this.fgRT = this.showQ = null; this.sched = null; this.lastColor = null;
    this._bf?.rt.dispose(); this._bf = null;
  }
}
const AIM_POSE = newPose(), AIM_HOLD = 150;   // fresh aim: the pose a frame was made for; ms the input counts as turning the camera after it last did
export { gpuSparks } from './particles-gpu.js';
