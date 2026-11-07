// Next Gen 3D kit: modern HD rendering for era:'nextgen' games (see docs/nextgen-3d.md).
//
// Where the Classic Console kit (toon3d.js) is flat cel shading with ink lines, this one is the
// current-generation look: physically based materials (roughness, metalness, normal maps),
// image-based reflections, real-time shadows, HDR lighting with bloom, ambient occlusion,
// MSAA, filmic tone mapping and a colour grade (vignette, grain, lens fringing), plus a GPU
// particle system for sparks, smoke and embers.
//
// One shared WebGL renderer and one post-processing chain draw every Next Gen game (phones only
// allow a few WebGL contexts). A game owns an HDView: a three.js scene + perspective camera. In
// draw(c) it moves things, then calls v.render(c, W, H), which renders the 3D frame into the
// slide's 2D canvas; the game then draws its 2D HUD on top.
//
// Performance: the kit watches frame times and adapts. It first lowers the render resolution
// (down to 55%), then drops a quality tier (ultra: AO + MSAA + 1024 shadows -> high -> medium ->
// low: no shadows, no AO). Tiers are listed in TIERS below. The starting tier and frame rate come
// from the phone's class (src/kit/speed.js: a top phone starts on ultra at 120 fps), and where a game
// settled is remembered for its next round.
//
// Speed tricks that keep the picture the same:
//  - the 3D canvas is shown directly on the playing card, under the card's 2D canvas (which keeps
//    the HUD), instead of being copied into it every frame. When the 3D canvas moves to another
//    card, the last frame is baked into the old card so it keeps its picture.
//  - bloom, tone mapping and the colour grade run as one final full-screen pass, and the bloom is a
//    small down/up-sampling chain at half resolution and below.
//  - shadow maps are only redrawn when something that casts a shadow (or a light) has moved.
import {
  WebGLRenderer, Scene, Color, FogExp2, PerspectiveCamera, HemisphereLight, PointLight, SpotLight, DirectionalLight,
  MeshStandardMaterial, MeshPhysicalMaterial, ShaderMaterial, BufferGeometry, BufferAttribute, Points, AdditiveBlending, NormalBlending,
  CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace, PCFSoftShadowMap, ACESFilmicToneMapping, HalfFloatType,
  WebGLRenderTarget, Vector2, Vector3, PMREMGenerator, LinearMipmapLinearFilter, Mesh, BoxGeometry, LinearFilter, AdditiveBlending as ADD,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { speed, phoneClass, fpsFor, stepDown, stepUp, settle, settledFor } from './speed.js';

export * as THREE from 'three';

const rbs = new Map();
/** A bevelled box w x h x d with corner radius r (cached): real highlights on every edge. */
export function rbox(w, h, d, r = Math.min(w, h, d) * .2) {
  const k = [w, h, d, r].join();
  if (!rbs.has(k)) rbs.set(k, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * .999));
  return rbs.get(k);
}

/* ---------- quality tiers ---------- */
// px: most pixels rendered per frame before scaling up; shadow: shadow map size (0 = off);
// lights: how many nearby lamps get a real light (the rest just glow); ao: screen-space ambient
// occlusion; msaa: multisample count (0 = a cheap edge smoothing in the final pass instead);
// bloom: bloom resolution scale. 2x MSAA (not 4x) costs phone GPUs far less memory traffic, and the
// time saved goes into more pixels.
export const TIERS = [
  { name: 'low', px: .5e6, shadow: 0, lights: 2, ao: false, msaa: 0, bloom: .5 },
  { name: 'medium', px: .85e6, shadow: 512, lights: 3, ao: false, msaa: 0, bloom: .5 },
  { name: 'high', px: 1.3e6, shadow: 1024, lights: 4, ao: false, msaa: 2, bloom: .5 },
  { name: 'ultra', px: 2e6, shadow: 1024, lights: 4, ao: true, msaa: 2, bloom: .5 },
];
// Where a phone starts: top phones (Fold 8, recent iPhone Pro) on ultra, others on high or medium.
const START = { top: 3, mid: 2, low: 1 };
// Resolution moves in a few fixed steps (each step reallocates the render targets, so it must be
// rare): drop a step after two slow windows of ~45 frames, climb back after ~6 s at full speed, and
// never climb back above a step that already proved too slow (for 30 s). Tiers change the same way.
// The frame budget follows the game's frame rate (8.3 ms at 120 fps, 16.7 at 60, 33 at 30). At 120
// fps a struggling game first gives up a little resolution, then drops to 60 fps at full resolution
// (keeping the picture); at the lowest tier and resolution it can drop to 30.
const LEVELS = [1, .85, .7, .55];
const Q = { tier: 2, lvl: 0, sum: 0, cnt: 0, slow: 0, fast: 0, lastT: 0, ceil: 0, ceilT: 0, tierCeil: 3, force: null, game: undefined, easy: 0, fpsT: 0 };
// a new game is on screen: start from where it settled last time, or from the phone's class
function startGame(def) {
  Q.game = def; const s = settledFor(def?.id);
  Q.tier = s?.tier ?? START[phoneClass()] ?? 2; Q.lvl = 0; Q.ceil = 0; Q.tierCeil = 3; Q.sum = Q.cnt = Q.slow = Q.fast = Q.easy = 0; Q.lastT = 0;
}
function adapt(gap) {
  if (Q.force != null || !(gap > 0 && gap < 100)) return;
  Q.sum += gap; if (++Q.cnt < 45) return;
  const a = Q.sum / Q.cnt, now = performance.now(), fps = Q.game ? fpsFor(Q.game) : 60, budget = 1000 / fps; Q.sum = Q.cnt = 0;
  if (now - Q.ceilT > 30000) { Q.ceil = 0; Q.tierCeil = 3; }
  const tier0 = Q.tier;
  if (a > budget * 1.26) {
    Q.fast = 0; Q.easy = 0; if (++Q.slow < 2) return; Q.slow = 0; Q.ceilT = now;
    if (fps > 60 && Q.lvl >= 1 && stepDown(Q.game)) { Q.lvl = 0; Q.ceil = 0; Q.fpsT = now; }
    else if (Q.lvl < LEVELS.length - 1) { Q.lvl++; Q.ceil = Q.lvl; }
    else if (Q.tier > 0) { Q.tierCeil = Q.tier - 1; Q.tier--; Q.lvl = 1; Q.ceil = 1; }
    else if (stepDown(Q.game)) { Q.lvl = 1; Q.fpsT = now; }
  } else if (a < budget * 1.044) {
    Q.slow = 0; if (++Q.fast < 8) return; Q.fast = 0;
    if (Q.lvl > Q.ceil) Q.lvl--; else if (Q.lvl === 0 && Q.tier < Math.min(Q.tierCeil, TIERS.length - 1)) { Q.tier++; Q.lvl = 1; }
    // a long spell of easy frames at the top tier, a while after stepping the frame rate down: try one notch up
    else if (Q.lvl === 0 && Q.tier === TIERS.length - 1 && ++Q.easy >= 3 && now - Q.fpsT > 60000 && stepUp(Q.game)) { Q.easy = 0; Q.fpsT = now; }
  } else { Q.slow = 0; Q.fast = 0; }
  if (Q.tier !== tier0) settle(Q.game?.id, { tier: Q.tier });
}
/** Current quality: { tier, name, res }. Set HD.force = 0..3 to pin a tier (tests, screenshots). */
export const HD = {
  get tier() { return Q.force ?? Q.tier; }, get name() { return TIERS[this.tier].name; }, get res() { return Q.force != null ? 1 : LEVELS[Q.lvl]; },
  set force(t) { Q.force = t; }, get force() { return Q.force; },
  /** Last frame: draw calls, triangles, milliseconds spent in render() on the CPU, and whether the shadows were redrawn. */
  info: { calls: 0, tris: 0, cpu: 0, shadows: false },
  /** Show the 3D canvas directly on the card (false: copy each frame into the card's canvas, as tests and screenshots need). */
  direct: typeof navigator === 'undefined' || !navigator.webdriver,
};
const tier = () => TIERS[HD.tier];
if (typeof window !== 'undefined') window.__hd = HD;   // test hook: __hd.force = 3 pins ultra

/* ---------- shared renderer + post chain ---------- */
let R = null, broken = false, comp = null, P = {}, envTex = null, compKey = '';
function renderer() {
  if (R || broken) return R;
  try {
    const cv = document.createElement('canvas');
    R = new WebGLRenderer({ canvas: cv, alpha: true, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', stencil: false });
    R.setPixelRatio(1); R.outputColorSpace = SRGBColorSpace;
    R.toneMapping = ACESFilmicToneMapping; R.toneMappingExposure = 1;
    R.shadowMap.enabled = true; R.shadowMap.type = PCFSoftShadowMap; R.shadowMap.autoUpdate = false;   // redrawn only when something moved
    cv.addEventListener('webglcontextlost', e => e.preventDefault());
    const pm = new PMREMGenerator(R); envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  } catch (e) { broken = true; R = null; }
  return R;
}
/** True if this device can draw Next Gen games. */
export const hasHD = () => !!renderer();

// The final pass: bloom, tone mapping, sRGB and the colour grade in one full-screen pass (they used
// to be four: bloom blend, output, grade, plus bloom's own full-size copy). The grade is a vignette,
// fine film grain, a touch of lens fringing at the edges, and a hurt tint the game can pulse
// (v.hurt = 0..1). With no MSAA the same pass smooths jagged edges (a light FXAA).
//
// Bloom is a small chain: the bright parts are picked out into a half-size buffer, shrunk four more
// times, then grown back up, each step adding a softer copy. That's 9 tiny passes, where the old
// bloom took 13 bigger ones.
const QV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const qmat = (fs, uniforms, o = {}) => new ShaderMaterial({ uniforms, vertexShader: QV, fragmentShader: fs, depthTest: false, depthWrite: false, ...o });
// bright parts only (anything brighter than the threshold keeps its full colour, fading in just under it), 4 taps
const BRIGHT = `uniform sampler2D tDiffuse; uniform vec2 px; uniform float thr; varying vec2 vUv;
  vec3 pick(vec2 o){ vec3 c = texture2D(tDiffuse, vUv + o * px).rgb; float l = dot(c, vec3(.2126, .7152, .0722));
    return c * smoothstep(thr - .05, thr + .05, l); }
  void main(){ vec3 c = pick(vec2(-1., -1.)) + pick(vec2(1., -1.)) + pick(vec2(-1., 1.)) + pick(vec2(1., 1.)); gl_FragColor = vec4(c * .25, 1.); }`;
const DOWN = `uniform sampler2D tDiffuse; uniform vec2 px; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 4.;
    c += texture2D(tDiffuse, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(-px.x, px.y)).rgb + texture2D(tDiffuse, vUv + px).rgb;
    gl_FragColor = vec4(c / 8., 1.); }`;
const UP = `uniform sampler2D tDiffuse; uniform vec2 px; uniform float k; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv + vec2(-2. * px.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(2. * px.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(0., -2. * px.y)).rgb + texture2D(tDiffuse, vUv + vec2(0., 2. * px.y)).rgb;
    c += 2. * (texture2D(tDiffuse, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(-px.x, px.y)).rgb + texture2D(tDiffuse, vUv + px).rgb);
    gl_FragColor = vec4(c / 12. * k, 1.); }`;
const FINAL = `uniform sampler2D tDiffuse, tBloom; uniform float t, hurt, vig, bloom; uniform vec2 px; varying vec2 vUv;
  // (three.js adds its tone mapping and sRGB helpers to every ShaderMaterial)
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 tex(vec2 p){ return texture2D(tDiffuse, p).rgb; }
  float luma(vec3 c){ float l = dot(c, vec3(.299, .587, .114)); return l / (1. + l); }
  void main(){
    vec2 d = vUv - .5; float r2 = dot(d, d);
  #ifdef FXAA
    // light edge smoothing: find the edge direction from the four diagonal neighbours, blur along it
    vec3 cM = tex(vUv); float lM = luma(cM), lNW = luma(tex(vUv + vec2(-1., -1.) * px)), lNE = luma(tex(vUv + vec2(1., -1.) * px)),
      lSW = luma(tex(vUv + vec2(-1., 1.) * px)), lSE = luma(tex(vUv + vec2(1., 1.) * px));
    float lo = min(lM, min(min(lNW, lNE), min(lSW, lSE))), hi = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    vec3 col = cM;
    if (hi - lo > max(.04, hi * .125)) {
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float rcp = 1. / (min(abs(dir.x), abs(dir.y)) + max((lNW + lNE + lSW + lSE) * .03125, .0078125));
      dir = clamp(dir * rcp, -8., 8.) * px;
      vec3 a = .5 * (tex(vUv + dir * (1. / 3. - .5)) + tex(vUv + dir * (2. / 3. - .5)));
      vec3 b = a * .5 + .25 * (tex(vUv - dir * .5) + tex(vUv + dir * .5));
      float lb = luma(b); col = lb < lo || lb > hi ? a : b;
    }
  #else
    vec2 off = d * r2 * .012;
    vec3 col = vec3(tex(vUv + off).r, tex(vUv).g, tex(vUv - off).b);
  #endif
    col += texture2D(tBloom, vUv).rgb * bloom;
    col = ACESFilmicToneMapping(col);
    col = sRGBTransferOETF(vec4(col, 1.)).rgb;
    col *= 1. - vig * smoothstep(.12, .62, r2 * 1.6);
    col += (h(vUv / px + t) - .5) * .035;
    col = mix(col, col * vec3(1.25, .45, .4) + vec3(.12, 0., 0.), hurt * smoothstep(.04, .4, r2));
    gl_FragColor = vec4(col, 1.);
  }`;
const MIPS = 5;
class FinalPass extends Pass {
  constructor() {
    super(); this.needsSwap = false;
    this.bright = qmat(BRIGHT, { tDiffuse: { value: null }, px: { value: new Vector2() }, thr: { value: .82 } });
    this.down = qmat(DOWN, { tDiffuse: { value: null }, px: { value: new Vector2() } });
    this.up = qmat(UP, { tDiffuse: { value: null }, px: { value: new Vector2() }, k: { value: 1 } }, { blending: ADD });
    this.final = qmat(FINAL, { tDiffuse: { value: null }, tBloom: { value: null }, t: { value: 0 }, hurt: { value: 0 }, vig: { value: .32 }, bloom: { value: .7 }, px: { value: new Vector2(1, 1) }, toneMappingExposure: { value: 1 } }, { defines: { SRGB_TRANSFER: '' } });
    this.quad = new FullScreenQuad(null); this.mips = []; this.scale = .5; this.w = 0; this.h = 0; this.fxaa = false; this.strength = .7;
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    const bw = Math.max(1, Math.round(w * this.scale)), bh = Math.max(1, Math.round(h * this.scale));
    if (this.mips[0] && this.mips[0].width === bw && this.mips[0].height === bh) return;
    for (const m of this.mips) m.dispose(); this.mips = [];
    for (let i = 0, x = bw, y = bh; i < MIPS && x >= 2 && y >= 2; i++, x = Math.max(1, x >> 1), y = Math.max(1, y >> 1))
      this.mips.push(new WebGLRenderTarget(x, y, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter }));
  }
  setFxaa(on) { if (this.fxaa === on) return; this.fxaa = on; if (on) this.final.defines.FXAA = ''; else delete this.final.defines.FXAA; this.final.needsUpdate = true; }
  pass(r, mat, target) { this.quad.material = mat; r.setRenderTarget(target); this.quad.render(r); }
  render(r, writeBuffer, readBuffer) {
    const M = this.mips, F = this.final.uniforms, auto = r.autoClear;
    const on = this.strength > 0 && M.length > 1;
    if (on) {
      const b = this.bright.uniforms; b.tDiffuse.value = readBuffer.texture; b.px.value.set(.5 / readBuffer.width, .5 / readBuffer.height);
      this.pass(r, this.bright, M[0]);
      for (let i = 1; i < M.length; i++) { const u = this.down.uniforms; u.tDiffuse.value = M[i - 1].texture; u.px.value.set(1 / M[i - 1].width, 1 / M[i - 1].height); this.pass(r, this.down, M[i]); }
      r.autoClear = false;   // grow back up, adding each softer level onto the sharper one
      for (let i = M.length - 1; i > 0; i--) { const u = this.up.uniforms; u.tDiffuse.value = M[i].texture; u.px.value.set(.5 / M[i].width, .5 / M[i].height); u.k.value = 1; this.pass(r, this.up, M[i - 1]); }
      r.autoClear = auto;
    }
    F.tDiffuse.value = readBuffer.texture; F.tBloom.value = M[0]?.texture ?? null; F.bloom.value = on ? this.strength * .8 : 0;
    F.toneMappingExposure.value = r.toneMappingExposure; F.px.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    this.pass(r, this.final, this.renderToScreen ? null : writeBuffer);
  }
  dispose() { for (const m of this.mips) m.dispose(); for (const m of [this.bright, this.down, this.up, this.final]) m.dispose(); this.quad.dispose(); }
}
function chain(r, w, h) {
  const T = tier();
  if (comp && compKey !== T.msaa) {   // MSAA on/off: re-create just the two buffers
    compKey = T.msaa;
    for (const rt of [comp.renderTarget1, comp.renderTarget2]) { rt.dispose(); rt.samples = T.msaa; }
  }
  if (!comp) {
    compKey = T.msaa;
    const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: T.msaa });
    comp = new EffectComposer(r, rt);
    P.render = new RenderPass(new Scene(), new PerspectiveCamera());
    P.ao = new GTAOPass(new Scene(), new PerspectiveCamera(), w, h);
    P.ao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); P.ao.blendIntensity = .9;
    P.final = new FinalPass();
    for (const p of [P.render, P.ao, P.final]) comp.addPass(p);
    comp.setSize(w, h); comp.cw = w; comp.ch = h;
  }
  return comp;
}

// See-through chain for AR games (src/kit/ar3d.js): the camera picture is drawn first, so the 3D
// frame keeps a transparent background. Just the scene (with MSAA) and tone mapping: bloom and the
// colour grade would also tint the real world behind it.
let arComp = null, arKey = '';
function seeThrough(r, w, h) {
  const T = tier();
  if (arComp && arKey !== T.msaa) { arKey = T.msaa; for (const rt of [arComp.renderTarget1, arComp.renderTarget2]) { rt.dispose(); rt.samples = T.msaa; } }
  if (!arComp) {
    arKey = T.msaa;
    arComp = new EffectComposer(r, new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: T.msaa }));
    P.arRender = new RenderPass(new Scene(), new PerspectiveCamera(), null, new Color(0), 0);
    arComp.addPass(P.arRender); arComp.addPass(new OutputPass());
    arComp.setSize(w, h); arComp.cw = w; arComp.ch = h;
  }
  return arComp;
}

/* ---------- materials and procedural textures ---------- */
/**
 * A PBR material. col: base colour; rough/metal 0..1; glow: emissive strength (values above 1
 * bloom); tex: a surface() set; rep: texture repeat [u, v]. Extra options pass to three.js.
 */
export function pbr(col = '#ffffff', { rough = .6, metal = 0, glow = 0, glowCol, tex, rep, clear = 0, ...o } = {}) {
  const M = clear || o.sheen ? MeshPhysicalMaterial : MeshStandardMaterial;
  const m = new M({ color: col, roughness: rough, metalness: metal, ...o });
  if (clear) { m.clearcoat = clear; m.clearcoatRoughness = .15; }
  if (glow) { m.emissive = new Color(glowCol || col); m.emissiveIntensity = glow; }
  if (tex) {
    const t = rep ? tex.repeat(rep[0], rep[1]) : tex;
    m.map = t.map; m.normalMap = t.normal; m.roughnessMap = t.rough; if (t.metal) { m.metalnessMap = t.metal; }
    m.normalScale.set(t.ns ?? 1, t.ns ?? 1);
  }
  return m;
}
/**
 * Make a tiling surface texture set in code (no image files). paint(g) draws three layers on
 * size x size canvases: g.col (colour), g.h (height: white = raised), g.r (roughness: white =
 * rough). The kit turns the height layer into a normal map. Returns { map, normal, rough,
 * repeat(u, v) } where repeat() returns a copy with that tiling.
 */
export function surface(size, paint, { strength = 2.5 } = {}) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const C = mk(), Hc = mk(), Rc = mk(), g = { col: C.getContext('2d'), h: Hc.getContext('2d'), r: Rc.getContext('2d'), size };
  g.h.fillStyle = '#808080'; g.h.fillRect(0, 0, size, size); g.r.fillStyle = '#999'; g.r.fillRect(0, 0, size, size);
  paint(g);
  // height -> tangent-space normal map (wrapping Sobel)
  const hd = g.h.getImageData(0, 0, size, size).data, N = mk(), nc = N.getContext('2d'), out = nc.createImageData(size, size);
  const at = (x, y) => hd[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4; out.data[i] = (nx * .5 + .5) * 255; out.data[i + 1] = (ny * .5 + .5) * 255; out.data[i + 2] = (nz * .5 + .5) * 255; out.data[i + 3] = 255;
  }
  nc.putImageData(out, 0, 0);
  const tx = (cv, srgb) => { const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.anisotropy = 4; t.minFilter = LinearMipmapLinearFilter; return t; };
  const base = { map: tx(C, true), normal: tx(N), rough: tx(Rc) };
  const set = (u, v, b = base) => {
    if (u === 1 && v === 1) return { ...b, repeat: set };
    const cl = {}; for (const k of ['map', 'normal', 'rough']) { cl[k] = b[k].clone(); cl[k].repeat.set(u, v); cl[k].needsUpdate = true; }
    return { ...cl, repeat: set };
  };
  return { ...base, repeat: set };
}
/** Speckle noise helper for surface painters: n dots of colour col, radius up to r. */
export function speckle(ctx, size, n, col, r = 1.5, a = .2) {
  ctx.save(); ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { ctx.globalAlpha = Math.random() * a; ctx.beginPath(); ctx.arc(Math.random() * size, Math.random() * size, Math.random() * r + .3, 0, 7); ctx.fill(); }
  ctx.restore();
}

/* ---------- particles ---------- */
const PV = `attribute float size; attribute vec4 tint; varying vec4 vT; uniform float scale;
  void main(){ vT = tint; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = size * scale / max(.05, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PF = `varying vec4 vT; uniform float soft; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard;
  float a = soft > .5 ? (1. - r) * (1. - r) : smoothstep(1., .3, r); gl_FragColor = vec4(vT.rgb, vT.a * a); }`;
/**
 * A pool of camera-facing soft particles, drawn in view v (new Particles(v, ...)). additive: true for sparks / fire / glints (colours
 * above 1 bloom), false for smoke and dust. p.emit({ x, y, z, vx, vy, vz, life, size, grow,
 * col: [r, g, b], a, drag, grav }) then p.update(dt) once per frame.
 */
export class Particles {
  constructor(view, { max = 300, additive = true } = {}) {
    this.max = max; this.list = [];
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute('size', new BufferAttribute(new Float32Array(max), 1));
    g.setAttribute('tint', new BufferAttribute(new Float32Array(max * 4), 4));
    this.mat = new ShaderMaterial({ vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, uniforms: { scale: { value: 300 }, soft: { value: additive ? 0 : 1 } } });
    this.pts = new Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; view.scene.add(this.pts); view.parts.push(this);
  }
  emit(o) { if (this.list.length >= this.max) this.list.shift(); this.list.push({ vx: 0, vy: 0, vz: 0, life: 1, size: .1, grow: 0, col: [1, 1, 1], a: 1, drag: 0, grav: 0, ...o, t: 0 }); }
  clear() { this.list.length = 0; }
  update(dt) {
    const L = this.list, g = this.pts.geometry, P = g.attributes.position.array, S = g.attributes.size.array, T = g.attributes.tint.array;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.t += dt; if (p.t >= p.life) continue;
      const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -.35; p.vx *= .6; p.vz *= .6; }
      const f = p.t / p.life;
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z; S[n] = p.size * (1 + p.grow * f);
      T[n * 4] = p.col[0]; T[n * 4 + 1] = p.col[1]; T[n * 4 + 2] = p.col[2]; T[n * 4 + 3] = p.a * (p.fadeIn ? Math.min(1, f * 6) : 1) * (1 - f) ** (p.ease ?? 1);
      L[n++] = p;
    }
    L.length = n; g.setDrawRange(0, n);
    for (const [a, k] of [['position', 3], ['size', 1], ['tint', 4]]) { const at = g.attributes[a]; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n * k)); at.needsUpdate = true; }
  }
}

/* ---------- view ---------- */
export class HDView {
  /**
   * bg: background colour; fog: density of exponential fog (0 = none); env: strength of the
   * image-based reflections; sky/ground/amb: hemisphere fill light.
   */
  constructor({ bg = '#0a0c10', fog = 0, env = .35, sky = '#9ab0d0', ground = '#2a2420', amb = .25, fov = 70 } = {}) {
    this.scene = new Scene(); this.scene.background = new Color(bg);
    if (fog) this.scene.fog = new FogExp2(bg, fog);
    this.envI = env; this.hemi = new HemisphereLight(sky, ground, amb); this.scene.add(this.hemi);
    this.cam = new PerspectiveCamera(fov, 1, .05, 120); this.scene.add(this.cam);
    this.hurt = 0; this.t = 0; this.W = 240; this.H = 320; this.exposure = 1; this.bloom = .7;
    this.lamps = []; this.tierSeen = -1; this.parts = [];
  }
  /**
   * A pool of real point lights placed each frame at the nearest of many lamp spots (the far ones
   * only glow). Call v.lampLights(maxDistance) once, then v.placeLamps(spots, x, y, z) per frame
   * with spots = [{ x, y, z, col, i, flick }].
   */
  lampLights(dist = 7) {
    for (let i = 0; i < 4; i++) { const l = new PointLight('#ffd8a0', 0, dist, 1.6); this.scene.add(l); this.lamps.push(l); }
    return this;
  }
  placeLamps(spots, x, y, z, t = 0) {
    const n = tier().lights, near = spots.map(s => [s, (s.x - x) ** 2 + (s.z - z) ** 2 + (s.y - y) ** 2]).sort((a, b) => a[1] - b[1]);
    this.lamps.forEach((l, i) => {
      const s = near[i]?.[0]; l.visible = i < n && !!s;
      if (!l.visible) return;
      l.position.set(s.x, s.y, s.z); l.color.set(s.col || '#ffd8a0');
      const fl = s.flick ? (Math.sin(t * 31 + s.x * 7) > .6 || Math.sin(t * 3.1 + s.z) > .95 ? .25 : 1) : 1;
      // fade the furthest light in/out so swapping which lamps are lit never pops
      const fade = i === n - 1 && near[n] ? Math.min(1, (near[n][1] - near[i][1]) * .6) : 1;
      l.intensity = (s.i ?? 6) * fl * fade; s.lit = fl;
    });
  }
  /** Size the camera to the game's W x H (call from draw before render). */
  fit(W, H) { if (W !== this.W || H !== this.H || this.cam.aspect !== W / H) { this.W = W; this.H = H; this.cam.aspect = W / H; this.cam.updateProjectionMatrix(); } return this; }
  /** Logical screen position of a world point: [x, y, depth] (depth > 1 = behind the camera). */
  toScreen(x, y, z) { const p = new Vector3(x, y, z).project(this.cam); return [(p.x + 1) / 2 * this.W, (1 - p.y) / 2 * this.H, p.z]; }
  /**
   * Compile every shader the scene can need now (hidden things too: muzzle flashes, explosions,
   * swapped materials), so nothing compiles mid-game and stutters. Call after building a level;
   * extra materials that get swapped in later can be passed in.
   */
  warm(...extra) {
    const r = renderer(); if (!r) return; this.warmed = true;
    const hidden = [], tmp = [];
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    for (const m of extra) { const ms = new Mesh(new BoxGeometry(.01, .01, .01), m); this.scene.add(ms); tmp.push(ms); }
    this.scene.environment = envTex;
    const was = r.shadowMap.enabled;
    try { for (const sh of [true, false]) { r.shadowMap.enabled = sh; r.compile(this.scene, this.cam); } } catch (e) { /* compile is only a warm-up */ }
    r.shadowMap.enabled = was;
    for (const o of hidden) o.visible = false; for (const ms of tmp) { this.scene.remove(ms); ms.geometry.dispose(); }
  }
  /** Called when the quality tier changes: let the game switch shadows on lights it owns. */
  onTier(fn) { this.tierFn = fn; return this; }

  /**
   * A number that changes whenever anything that casts a shadow moves, turns, appears or hides, or a
   * shadow light changes. While it stays the same, the shadow maps from last frame are still right.
   */
  shadowKey() {
    let h = 0, i = 0;
    this.scene.traverseVisible(o => {
      if (!o.castShadow) return;
      const e = o.matrixWorld.elements, w = (++i % 89) + 1;
      h += (e[0] * 1.3 + e[1] * 1.7 + e[2] * 2.3 + e[4] * 2.9 + e[5] * 3.1 + e[6] * 3.7 + e[8] * 4.1 + e[9] * 4.3 + e[10] * 4.7 + e[12] * 5.3 + e[13] * 5.9 + e[14] * 6.1) * w;
      if (o.isInstancedMesh) h += (o.instanceMatrix.version + o.count * 7) * w;
      if (o.isLight) h += (o.shadow.mapSize.x + (o.target ? o.target.matrixWorld.elements[12] * 3 + o.target.matrixWorld.elements[14] * 5 : 0) + o.angle * 11 + o.distance * 13) * w;
    });
    return h + i * 1e-4;
  }
  /** Redraw the shadow maps next frame even if nothing seems to have moved (e.g. after changing a geometry in place). */
  shadowsDirty() { this.shKey = null; return this; }
  /**
   * The 3D canvas belongs to another card now: draw this view's last frame under the HUD already on
   * its canvas (and the camera picture under that, for AR), so the card keeps its picture.
   */
  bake(c) {
    const r = renderer(); if (!r) return;
    this.render(c, this.W, this.H, true);
    const u = this.under;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-over';
    const W = c.canvas.width, H = c.canvas.height;
    if (u?.videoWidth) { const s = Math.max(W / u.videoWidth, H / u.videoHeight); c.drawImage(u, (W - u.videoWidth * s) / 2, (H - u.videoHeight * s) / 2, u.videoWidth * s, u.videoHeight * s); }
    else if (this.clearBg) { c.fillStyle = '#151a22'; c.fillRect(0, 0, W, H); }
    c.restore();
  }

  /**
   * Render the frame for 2D canvas c (logical units w x h), with post-processing. Normally the 3D
   * canvas is shown on the card right under c, and c is cleared so the game draws its HUD on top.
   * For a game in the AR kit, v.under (an element, the camera video) is shown under the 3D canvas and
   * v.underCss is a CSS background for it. With HD.direct off (tests), the frame is copied into c.
   */
  render(c, w = this.W, h = this.H, baking = false) {
    this.fit(w, h);
    const r = renderer();
    if (!r) { c.fillStyle = this.scene.background ? '#' + this.scene.background.getHexString() : '#0b0f14'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('This device cannot show 3D', w / 2, h / 2); return; }
    const now = performance.now();
    // where the frame goes: straight onto the card (moving the 3D canvas here first, which bakes the
    // last frame into the card it leaves), or copied into c
    const direct = HD.direct && !baking && !!c.canvas.parentNode && mount(r.domElement, c, this);
    if (!baking) {
      if (Q.game !== speed.game) startGame(speed.game);
      // adaptive quality: first resolution, then tier (and frame rate)
      const gap = now - (Q.lastT || now); Q.lastT = now; adapt(gap);
    }
    const T = tier();
    if (this.tierSeen !== HD.tier) { this.tierSeen = HD.tier; this.tierFn?.(T); }
    let pw = c.canvas.width, ph = c.canvas.height; const q = Math.min(1, Math.sqrt(T.px / (pw * ph))) * HD.res;
    pw = Math.max(16, Math.round(pw * q)); ph = Math.max(16, Math.round(ph * q));
    const cv = r.domElement; if (cv.width !== pw || cv.height !== ph) r.setSize(pw, ph, false);
    const cp = this.clearBg ? seeThrough(r, pw, ph) : chain(r, pw, ph); if (cp.cw !== pw || cp.ch !== ph) { cp.setSize(pw, ph); cp.cw = pw; cp.ch = ph; }
    this.scene.environment = envTex; this.scene.environmentIntensity = this.envI;
    r.toneMappingExposure = this.exposure;
    if (this.clearBg) { P.arRender.scene = this.scene; P.arRender.camera = this.cam; } else { P.render.scene = P.ao.scene = this.scene; P.render.camera = P.ao.camera = this.cam; }
    for (const p of this.parts) p.mat.uniforms.scale.value = ph / (2 * Math.tan(this.cam.fov * Math.PI / 360));
    if (!baking) this.t += 1 / 60;
    if (!this.clearBg) {
      const F = P.final; P.ao.enabled = T.ao; F.strength = this.bloom; F.scale = T.bloom; F.setFxaa(!T.msaa);
      F.final.uniforms.t.value = this.t % 10; F.final.uniforms.hurt.value = this.hurt;
    }
    if (!this.warmed) this.warm();
    // shadows: redraw the maps only when a shadow caster or a shadow light moved (or the tier, view or map changed)
    this.scene.updateMatrixWorld();
    r.shadowMap.enabled = T.shadow > 0;
    let shadows = false;
    if (T.shadow > 0) { const k = this.shadowKey(); if (k !== this.shKey || lastView !== this) { this.shKey = k; r.shadowMap.needsUpdate = shadows = true; } }
    lastView = this;
    r.info.autoReset = false; r.info.reset();
    const mwa = this.scene.matrixWorldAutoUpdate; this.scene.matrixWorldAutoUpdate = false;   // already updated above
    try { cp.render(); } finally { this.scene.matrixWorldAutoUpdate = mwa; }
    if (!baking) { HD.info.calls = r.info.render.calls; HD.info.tris = r.info.render.triangles; HD.info.cpu = performance.now() - now; HD.info.shadows = shadows; }
    if (direct) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); return; }
    c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    if (baking) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-over'; c.drawImage(cv, 0, 0, pw, ph, 0, 0, c.canvas.width, c.canvas.height); }
    else c.drawImage(cv, 0, 0, pw, ph, 0, 0, w, h);
    c.restore();
  }
}

/* ---------- showing the 3D canvas on the card ---------- */
// The 3D canvas (and, for AR, the camera video under it) sits inside the card's screen, right before
// the card's own canvas, filling the same box (CSS .hd-layer). The card's canvas stays on top for the
// HUD and takes all the touches.
let host = null, lastView = null;
function mount(cv, c, view) {
  const hc = c.canvas, par = hc.parentNode, prevUnder = host?.under;
  if (host && host.canvas !== hc) {
    const old = host; host = null;
    if (old.canvas.isConnected) try { old.view.bake(old.ctx); } catch (_) { /* best effort */ }
    old.canvas.classList.remove('hd-host');
  }
  if (hc.previousSibling !== cv) par.insertBefore(cv, hc);
  cv.classList.add('hd-layer'); hc.classList.add('hd-host');
  const u = view.under || null;
  if (prevUnder && prevUnder !== u) prevUnder.remove();
  if (u) { u.classList.add('hd-layer'); if (cv.previousSibling !== u) par.insertBefore(u, cv); }
  const bg = view.underCss || ''; if (cv._bg !== bg) { cv._bg = bg; cv.style.background = bg; }
  host = { canvas: hc, ctx: c, view, under: u };
  return true;
}

/**
 * Sunlight: a shadow-casting directional light covering a size x size metre box that follows the
 * action (s.follow(x, y, z) each frame; it snaps to shadow texels so edges don't shimmer).
 */
export function sun(col = '#fff2d8', i = 3, size = 18, dir = [-.45, 1, .35]) {
  const s = new DirectionalLight(col, i), c = s.shadow.camera, d = new Vector3(...dir).normalize();
  s.castShadow = true; c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 120;
  s.shadow.bias = -.0004; s.shadow.normalBias = .04; s.shadow.radius = 2;
  s.setTier = T => { s.castShadow = T.shadow > 0; if (T.shadow && s.shadow.mapSize.x !== T.shadow * 2) { s.shadow.mapSize.set(T.shadow * 2, T.shadow * 2); s.shadow.map?.dispose(); s.shadow.map = null; } };
  s.follow = (x, y, z) => {
    const tx = 2 * size / s.shadow.mapSize.x; x = Math.round(x / tx) * tx; z = Math.round(z / tx) * tx;
    s.target.position.set(x, y, z); s.position.set(x + d.x * 50, y + d.y * 50, z + d.z * 50); s.target.updateMatrixWorld();
  };
  return s;
}
/** A shadow-casting spotlight (torch, searchlight) whose shadow follows the quality tier. */
export function spot(col = '#fff2e0', i = 30, dist = 16, angle = .5) {
  const s = new SpotLight(col, i, dist, angle, .55, 1.6);
  s.castShadow = true; s.shadow.bias = -.0004; s.shadow.normalBias = .02; s.shadow.camera.near = .2; s.shadow.radius = 3;
  s.setTier = T => { s.castShadow = T.shadow > 0; if (T.shadow && s.shadow.mapSize.x !== T.shadow) { s.shadow.mapSize.set(T.shadow, T.shadow); s.shadow.map?.dispose(); s.shadow.map = null; } };
  return s;
}
