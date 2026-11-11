// Classic Console on WebGPU: the twin of toon3d.js's WebGL drawing, on three.js's WebGPURenderer with
// TSL nodes. gpu.js prepareConsoleGPU() loads this and makes the renderer; toon3d.js draws a view here
// when everything in it has a WebGPU version, and on WebGL otherwise.
//
// The WebGL Console renderer draws straight to its canvas, so everything there happens in the screen's
// colours: see-through things blend, fog mixes and the ink is laid over colours that are already as the
// screen shows them. To draw the same picture, this renderer does too: every material's finished colour
// is turned into the screen's colours as it is written (celOut, for the whole renderer), with the fog
// mixed in after it, and the last pass only lays the ink on top. scripts/look-compare.cjs --webgpu
// draws the Console scenes both ways and compares them.
// Kit use only.
import { RenderPipeline, NodeMaterial, LightingModel, Layers, Scene, OrthographicCamera, UnsignedByteType, NoToneMapping, Color, Vector2, Vector3, Vector4 } from 'three/webgpu';
import {
  pass, context, uniform, vec2, vec3, vec4, float, mix, smoothstep, min, max, dot, abs, floor, mod, fwidth, select, If, Fn,
  normalView, positionView, diffuseColor, materialReference, modelViewProjection, screenUV, screenCoordinate, sRGBTransferOETF,
} from 'three/tsl';

// this frame's numbers (draw() copies them from the view and from toon3d.js's holders)
const U = {
  retro: uniform(new Vector4()), size: uniform(new Vector2(1, 1)),
  fog: uniform(new Vector3(1e9, 2e9, 0)), fogCol: uniform(new Color()),   // near, far, on; the fog's colour as the screen shows it
  px: uniform(new Vector2()), persp: uniform(0), near: uniform(1), far: uniform(100), dTol: uniform(1), fade: uniform(new Vector2(1e9, 2e9)), ink: uniform(new Color()),
  rim: uniform(new Vector3()), rimCol: uniform(new Color()),
};

/* ---------- the cel look (toon3d.js cel()) ---------- */
class CelModel extends LightingModel {
  direct({ lightDirection, lightColor, lightNode, reflectedLight }, builder) {
    // a cast shadow moves the pixel to the ramp's dark end (one clean edge, smoothed over a pixel); it doesn't darken the light itself
    const shadowed = !!(lightNode?.shadowNode && lightNode.baseColorNode && lightNode.light?.castShadow && builder.object.receiveShadow && builder.renderer.shadowMap.enabled);
    const ramp = at => materialReference('gradientMap', 'texture').context({ getUV: () => at }).r;
    let band = ramp(vec2(normalView.dot(lightDirection).mul(.5).add(.5), 0));
    if (shadowed) { const shade = vec3(lightNode.shadowNode).x, w = fwidth(shade).clamp(.02, .5); band = mix(ramp(vec2(0, 0)), band, smoothstep(float(.5).sub(w), float(.5).add(w), shade)); }
    reflectedLight.directDiffuse.addAssign((shadowed ? lightNode.baseColorNode : lightColor).mul(band).mul(diffuseColor.rgb).mul(1 / Math.PI));
  }
  indirect(builder) {
    const { ambientOcclusion, irradiance, reflectedLight } = builder.context;
    reflectedLight.indirectDiffuse.addAssign(irradiance.mul(diffuseColor.rgb).mul(1 / Math.PI));
    reflectedLight.indirectDiffuse.mulAssign(ambientOcclusion);
  }
}
const celModel = () => new CelModel();

/* ---------- retro looks (toon3d.js retro) ---------- */
// corners that snap to the pixel grid
const SNAPPED = Fn(() => {
  const p = vec4(modelViewProjection), g = U.retro.xy;
  return select(g.x.greaterThan(0).and(p.w.greaterThan(0)), vec4(floor(p.xy.div(p.w).mul(g).add(.5)).div(max(g, vec2(1))).mul(p.w), p.zw), p);
})();
// the 4 x 4 dither pattern, as toon3d.js's table: B4(x, y) = 4 * B2(x & 1, y & 1) + B2(x >> 1, y >> 1), B2(a, b) = (a ^ b) * 2 + b
const b2 = (a, b) => abs(a.sub(b)).mul(2).add(b);
const bayer = p => { const q = mod(floor(p), 4), lo = mod(q, 2), hi = floor(q.div(2)); return b2(lo.x, lo.y).mul(4).add(b2(hi.x, hi.y)).add(.5).div(16); };

// the kit's own materials (toon(), flat(), a fan): the ones the retro looks change, as on WebGL
const kit = m => !!m.userData?.gsLooks?.some(n => n === 'cel' || n === 'retro');
/** A material's WebGPU side (toon3d.js calls this before the renderer first draws it): the cel lighting, corners that can snap. */
export function dress(m) {
  if (m.userData.gsLooks?.includes('cel')) m.setupLightingModel = celModel;
  if (kit(m)) m.vertexNode = SNAPPED;
}

/* ---------- every material's colour, as WebGL writes it ---------- */
const celOut = (out, builder) => {
  const m = builder.material; if (m.gsRaw || m.isShadowPassMaterial) return out;
  const o = vec4(out), enc = sRGBTransferOETF(o.rgb);
  const fogged = m.fog === false ? enc : mix(enc, U.fogCol, U.fog.z.mul(smoothstep(U.fog.x, U.fog.y, positionView.z.negate())));
  if (!kit(m)) return vec4(fogged, o.a);
  // colours cut to a few shades with the dither pattern (rows counted from the bottom, as WebGL counts them)
  const L = U.retro.z, at = vec2(screenCoordinate.x, U.size.y.sub(screenCoordinate.y));
  return vec4(select(L.greaterThan(0), floor(fogged.mul(L).add(bayer(at))).div(max(L, 1)), fogged), o.a);
};

/** Sets a new Console WebGPU renderer up (gpu.js). */
export function setup(r) {
  r.setPixelRatio(1); r.toneMapping = NoToneMapping; r.shadowMap.enabled = true;
  r.contextNode = context({ getOutput: celOut });
}

/* ---------- the passes ---------- */
// One set for every Console view (each draw gives them the view's scene and camera), as WebGL has one
// canvas and one outline target: the scene in colour, the scene again as normals and depth for the
// outlines (things on layer 0 only), then the ink over the colour.
const chains = new WeakMap(), L0 = new Layers(), CLEAR = new Color(), NO_SCENE = new Scene(), NO_CAM = new OrthographicCamera();
function chainFor(r) {
  let ch = chains.get(r); if (ch) return ch;
  const normals = new NodeMaterial(); normals.fragmentNode = vec4(normalView.mul(.5).add(.5), 1); normals.vertexNode = SNAPPED; normals.gsRaw = true;
  const sp = pass(NO_SCENE, NO_CAM, { samples: 4, type: UnsignedByteType }), ip = pass(NO_SCENE, NO_CAM, { samples: 0, type: UnsignedByteType });
  ip.overrideMaterial = normals; ip.setLayers(L0);
  const col = sp.getTextureNode('output'), tN = ip.getTextureNode('output'), tD = ip.getTextureNode('depth');
  // the ink, as toon3d.js's inkQuad: a line where the depth jumps (on the nearer side) or the surface turns sharply
  const span = U.far.sub(U.near);
  const lin = u => { const d = tD.sample(u).r; return select(U.persp.greaterThan(.5), U.near.mul(U.far).div(U.far.sub(d.mul(span))), U.near.add(d.mul(span))); };
  const nrm = u => tN.sample(u).xyz.mul(2).sub(1);
  const inked = Fn(() => {
    const dc = lin(screenUV), nc = nrm(screenUV), e = float(0).toVar();
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const u = screenUV.add(vec2(U.px.x.mul(ox), U.px.y.mul(oy))), d = lin(u), tol = U.dTol.mul(select(U.persp.greaterThan(.5), min(d, dc).mul(.06).add(.02), float(1)));
      If(d.sub(dc).greaterThan(tol), () => { e.assign(1); });
      If(dot(nrm(u), nc).lessThan(.55).and(tD.sample(u).r.lessThan(1)), () => { e.assign(max(e, .85)); });
    }
    // the rim: nothing but far things a little way off towards the sun
    const r = float(0).toVar();
    for (const m of [1.7, 2.7]) If(lin(screenUV.add(U.rim.xy.mul(U.px).mul(m))).sub(dc).greaterThan(U.dTol.mul(m).mul(select(U.persp.greaterThan(.5), dc.mul(.06).add(.02), float(1)))), () => { r.assign(U.rim.z); });
    const seen = select(tD.sample(screenUV).r.greaterThanEqual(1), float(0), float(1).sub(smoothstep(U.fade.x, U.fade.y, dc)));
    e.mulAssign(seen); r.mulAssign(seen);
    const c = col.sample(screenUV).rgb;
    return vec4(select(e.greaterThanEqual(.01), mix(c, U.ink, e), mix(c, U.rimCol, r)), 1);
  })();
  const pipe = out => { const p = new RenderPipeline(r); p.outputColorTransform = false; p.outputNode = out; return p; };
  ch = { sp, ip, ink: pipe(inked), plain: pipe(vec4(col.rgb, 1)) };
  chains.set(r, ch); return ch;
}

/**
 * Draws a Console view (toon3d.js View) into the renderer's canvas, pw x ph pixels. ink and cel are
 * toon3d.js's own holders ({ value } each), already set for this frame.
 */
export function draw(r, v, pw, ph, { ink, cel }) {
  const ch = chainFor(r), scene = v.scene, fog = scene.fog, bg = scene.background, cv = r.domElement;
  if (cv.width !== pw || cv.height !== ph) r.setSize(pw, ph, false);
  U.retro.value.copy(cel.gsRetro.value); U.size.value.set(pw, ph);
  if (fog) { U.fog.value.set(fog.near, fog.far, 1); U.fogCol.value.copy(fog.color).convertLinearToSRGB(); } else U.fog.value.set(1e9, 2e9, 0);
  U.px.value.copy(ink.px.value); U.persp.value = ink.persp.value; U.near.value = ink.near.value; U.far.value = ink.far.value;
  U.dTol.value = ink.dTol.value; U.fade.value.copy(ink.fade.value); U.ink.value.copy(ink.ink.value);
  U.rim.value.set(ink.rim.value.x, -ink.rim.value.y, ink.rim.value.z); U.rimCol.value.copy(ink.rimCol.value);   // (down the screen is +y here)
  // three's own fog and background work in linear light: this renderer lays the fog itself (celOut) and
  // clears to the background's colour as the screen shows it
  if (bg?.isColor) { r.setClearColor(CLEAR.copy(bg).convertLinearToSRGB(), 1); scene.background = null; }
  scene.fog = null;
  ch.sp.scene = ch.ip.scene = scene; ch.sp.camera = ch.ip.camera = v.cam;
  try { (v.ink !== false ? ch.ink : ch.plain).render(); } finally { scene.fog = fog; scene.background = bg; ch.sp.scene = ch.ip.scene = NO_SCENE; }
}
