// The WebGPU versions of gs.fx3d's screen effects (outline, glitch, trails, pixelate), of a view's
// reflections (v.reflect()), of a baked light probe (v.bakeLight()) and of 3D text's look, as TSL nodes.
// hd3d-gpu.js's GpuChain puts them in its chain; each matches the WebGL pass of the same name
// (fx3d.js, hd3d.js), and reads its numbers from the pass the game holds, so a game changes an effect
// the same way on both. Kit use only.
import { Color, HalfFloatType, CubeRenderTarget, CubeCamera } from 'three/webgpu';
import { uniform, uv, rtt, Fn, vec2, vec3, vec4, float, mix, smoothstep, max, floor, fract, dot, sin, cos, select, If, fwidth, screenCoordinate, materialReference } from 'three/tsl';
import { outline } from 'three/examples/jsm/tsl/display/OutlineNode.js';
import { afterImage } from 'three/examples/jsm/tsl/display/AfterImageNode.js';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { gasStage } from './gas-gpu.js';

const hash2 = p => { const a = fract(vec3(p.x, p.y, p.x).mul(.1031)), b = a.add(dot(a, a.yzx.add(33.33))); return fract(b.x.add(b.y).mul(b.z)); };
const HALF = { depthBuffer: false, type: HalfFloatType };

/* ---------- 3D text (text3d.js) ---------- */
/**
 * The 'sdf' look: the letter's edge from the distance picture, smooth by one screen pixel at any size, and an
 * outline as a second edge further out. Every label's material shares one shader here (three keys a
 * classic material's shader by its settings, not its nodes), so the picture of letters and each number
 * are read from the material being drawn.
 */
const sdfOwn = (k, v) => uniform(v).onObjectUpdate(({ material }) => material?.userData?.gsSdf?.[k].value);
export function sdfLook(m) {
  const sd = materialReference('map', 'texture').r, aa = max(fwidth(sd), 1e-4), e = sdfOwn('gsSdfEdge', .75), ow = sdfOwn('gsSdfOutline', 0);
  const fill = smoothstep(e.sub(aa), e.add(aa), sd), cover = smoothstep(e.sub(ow).sub(aa), e.sub(ow).add(aa), sd);
  m.colorNode = vec4(mix(sdfOwn('gsSdfOutlineCol', new Color()), materialReference('color', 'color'), select(ow.greaterThan(0), fill, float(1))), 1);
  m.opacityNode = materialReference('opacity', 'float').mul(cover);
}

/* ---------- gs.fx3d's screen effects ---------- */
// Each pass a game holds (view.extras, marked gsFx by fx3d.js) takes a slot of its kind in the chain, in
// the order they were added. A pass taken away leaves its slot switched off, so an effect that comes and
// goes (a glitch on each hit) doesn't build the chain again; a new kind, or another order, does.
/** Fits the view's passes to the chain's slots; returns the slots' key (the chain is built again when it changes). */
export function fxPlan(ch, list) {
  const S = ch.fxSlots ||= []; let i = 0, fits = true;
  for (const s of S) s.pass = null;
  for (const p of list || []) {
    while (i < S.length && S[i].kind !== p.gsFx.kind) i++;
    if (i < S.length) S[i++].pass = p; else { fits = false; break; }
  }
  if (!fits) ch.fxSlots = list.map(p => ({ kind: p.gsFx.kind, pass: p, set: null }));
  return ch.fxSlots.map(s => s.kind).join(',');
}
const NONE = [];
const STAGE = {
  // big square pixels: fx3d.js pixelate (size in the scene's own pixels)
  pixelate(s, S, U, keep) {
    const size = uniform(4), on = uniform(0);
    s.set = p => { on.value = p ? 1 : 0; if (p) size.value = Math.max(1, +p.size || 1); };
    // (the squares are counted from the bottom left, as WebGL's are: a picture's v runs down here)
    return keep(Fn(() => {
      const q = uv(), d = U.px.mul(size), up = vec2(q.x, q.y.oneMinus()), c = floor(up.div(d)).add(.5).mul(d);
      return vec4(S.sample(select(on.greaterThan(.5), vec2(c.x, c.y.oneMinus()), q)).rgb, 1);
    })());
  },
  // three.js's GlitchPass and its DigitalGlitch shader: now and then (or always, goWild) the picture tears
  // into strips, the colours part and snow falls over it; the dice are thrown here each frame as the pass does
  glitch(s, S, U, keep) {
    const g = { byp: uniform(1), amount: uniform(0), angle: uniform(0), seed: uniform(0), sx: uniform(0), sy: uniform(0), dx: uniform(0), dy: uniform(0) }, COL = .05;
    const R = (a, b) => a + Math.random() * (b - a), wait = () => 120 + Math.floor(Math.random() * 121);
    let f = 0, every = wait();
    s.set = p => {
      if (!p) { g.byp.value = 1; return; }
      g.seed.value = Math.random(); g.byp.value = 0;
      if (f % every === 0 || p.goWild) { g.amount.value = Math.random() / 30; g.angle.value = R(-Math.PI, Math.PI); g.sx.value = R(-1, 1); g.sy.value = R(-1, 1); g.dx.value = R(0, 1); g.dy.value = R(0, 1); f = 0; every = wait(); }
      else if (f % every < every / 5) { g.amount.value = Math.random() / 90; g.angle.value = R(-Math.PI, Math.PI); g.dx.value = R(0, 1); g.dy.value = R(0, 1); g.sx.value = R(-.3, .3); g.sy.value = R(-.3, .3); }
      else g.byp.value = 1;
      f++;
    };
    return keep(Fn(() => {
      const q = uv(), p = vec2(q).toVar(), disp = hash2(floor(q.mul(g.seed).mul(g.seed).mul(64)));
      If(p.y.lessThan(g.dx.add(COL)).and(p.y.greaterThan(g.dx.sub(g.seed.mul(COL)))), () => { p.y.assign(select(g.sx.greaterThan(0), float(1).sub(p.y.add(g.dy)), g.dy)); });
      If(p.x.lessThan(g.dy.add(COL)).and(p.x.greaterThan(g.dy.sub(g.seed.mul(COL)))), () => { p.x.assign(select(g.sy.greaterThan(0), g.dx, float(1).sub(p.x.add(g.dx)))); });
      p.x.addAssign(disp.mul(g.sx).mul(g.seed.div(5))); p.y.addAssign(disp.mul(g.sy).mul(g.seed.div(5)));
      const off = vec2(cos(g.angle), sin(g.angle)).mul(g.amount);
      const col = vec3(S.sample(p.add(off)).r, S.sample(p).g, S.sample(p.sub(off)).b);
      const snow = hash2(floor(screenCoordinate.xy.mul(2)).mul(vec2(g.seed, g.seed.mul(50)))).mul(g.amount).mul(40);
      return vec4(select(g.byp.greaterThan(.5), S.sample(q).rgb, col.add(snow)), 1);
    })());
  },
  // three.js's afterimage: each frame keeps the brighter of itself and a fading copy of the last
  trails(s, S, U, keep, scaled) {
    const damp = uniform(0), n = scaled(afterImage(S, damp));
    s.set = p => { damp.value = p ? Math.max(0, Math.min(1, +p.damp || 0)) : 0; };
    return n.getTextureNode();
  },
  // three.js's outline: the chosen things' edges, seen and hidden, in two colours, added on top
  outline(s, S, U, keep, scaled, ch) {
    const thick = uniform(1), glow = uniform(0), k = uniform(0), seen = uniform(new Color()), hid = uniform(new Color());
    const n = scaled(outline(ch.scene, ch.cam, { selectedObjects: NONE, edgeThickness: thick, edgeGlow: glow })), ve = n.visibleEdge, he = n.hiddenEdge;
    s.set = p => {
      n.selectedObjects = p ? p.selectedObjects : NONE;
      if (!p) { k.value = 0; return; }
      const beat = p.pulsePeriod > 0 ? (1 + .25) / 2 + Math.cos(performance.now() * .01 / p.pulsePeriod) * (1 - .25) / 2 : 1;
      k.value = p.edgeStrength * beat; thick.value = p.edgeThickness; glow.value = p.edgeGlow; seen.value.copy(p.visibleEdgeColor); hid.value.copy(p.hiddenEdgeColor);
    };
    return keep(Fn(() => vec4(S.sample(uv()).rgb.add(seen.mul(ve).add(hid.mul(he)).mul(k)), 1))());
  },
  // gs.gas: smoke and fire walked through as a lit volume and laid over the scene (gas-gpu.js)
  gas: gasStage,
};
/**
 * The chain's effect stages after src (a picture node): returns the picture after them. ao: the ambient
 * occlusion still to go on (a node), or null if it's in the picture already; it goes in first, as the
 * effects move pixels about.
 */
export function fxStages(ch, src, ao, U) {
  const keep = fn => { const t = rtt(fn, 1, 1, HALF); t.renderTarget.gsPart = 'screen effects'; ch.fxR.push(t); return t; };
  // (three's nodes size themselves from the canvas: scaled down with the scene when it's drawn small and upscaled)
  const scaled = n => { const set = n.setSize.bind(n); n.setSize = (w, h) => set(Math.max(1, Math.round(w * ch.fxK)), Math.max(1, Math.round(h * ch.fxK))); ch.fxN.push(n); return n; };
  if (ao) { const S = src; src = keep(Fn(() => vec4(S.sample(uv()).rgb.mul(ao), 1))()); }
  for (const s of ch.fxSlots) src = STAGE[s.kind](s, src, U, keep, scaled, ch);
  return src;
}
/** Each frame: the stages' sizes (the scene's, w x h; k: the scene's share of the canvas) and each pass's numbers. */
export function fxFrame(ch, w, h, k) {
  ch.fxK = k;
  for (const t of ch.fxR) t.setSize(w, h);
  for (const s of ch.fxSlots) s.set?.(s.pass, w, h);
}
export function fxDispose(ch) {
  for (const t of ch.fxR || []) t.renderTarget?.dispose();
  for (const n of ch.fxN || []) n.dispose?.();
  ch.fxR = []; ch.fxN = [];
}

/* ---------- reflections (v.reflect()) ---------- */
// The scene's pass writes one more picture: which pixels belong to the things the game marked shiny, and
// how rough each is. three.js's screen-space reflections trace only those, and the result is added on.
const SHINY = uniform(0).onObjectUpdate(({ object }) => (object?.userData?.gsReflect ? 1 : 0));
const ROUGH = uniform(1).onObjectUpdate(({ material }) => material?.roughness ?? 1);
/** The extra picture for the scene pass's MRT (name it gsRefl). */
export const reflMRT = () => vec4(SHINY, ROUGH, 0, 1);
/** The scene's colour with the reflections added (a picture node). */
export function reflStage(ch, sp, colT) {
  const R = sp.getTextureNode('gsRefl'), C = colT;
  const n = ch.ssrN = ssr(C, sp.getTextureNode('depth'), ch.nrmN, { metalnessNode: R.r, roughnessNode: R.g, camera: ch.cam });
  n.maxDistance.value = 8; n.thickness.value = .05; n.intensity.value = .55; n.quality.value = .5;
  const hit = n.getTextureNode();
  ch.ssrT = rtt(Fn(() => vec4(C.sample(uv()).rgb.add(hit.sample(uv()).rgb), 1))(), 1, 1, HALF);
  ch.ssrT.renderTarget.gsPart = 'reflections';   // (hd3d.js gpuTime: the chip's time by pass; three's own SSR passes are found by name)
  return ch.ssrT;
}
export function reflFrame(ch, w, h, scale) {
  if (!ch.ssrT) return;
  ch.ssrT.setSize(w, h);
  if (ch.ssrN.resolutionScale !== scale) ch.ssrN.resolutionScale = scale;
}
export function reflDispose(ch) { ch.ssrN?.dispose(); ch.ssrT?.renderTarget?.dispose(); ch.ssrN = ch.ssrT = null; }

/* ---------- light probes (v.bakeLight()) ---------- */
/** The surroundings of a point as a cube picture on this renderer (three's LightProbeGenerator reads the light from it). */
export function bakeProbe(r, scene, at, size) {
  const rt = new CubeRenderTarget(size, { type: HalfFloatType }), cc = new CubeCamera(.05, 400, rt);
  cc.position.copy(at); scene.add(cc); cc.updateMatrixWorld(true);
  try { cc.update(r, scene); } catch (e) { rt.dispose(); throw e; } finally { cc.removeFromParent(); }
  return rt;
}
