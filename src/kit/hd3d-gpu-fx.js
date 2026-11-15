// The WebGPU versions of gs.fx3d's screen effects (outline, glitch, trails, pixelate), of a view's
// reflections (v.reflect()), of a baked light probe (v.bakeLight()) and of 3D text's look, as TSL nodes.
// hd3d-gpu.js's GpuChain puts them in its chain; each matches the WebGL pass of the same name
// (fx3d.js, hd3d.js), and reads its numbers from the pass the game holds, so a game changes an effect
// the same way on both. Kit use only.
import { Color, HalfFloatType, CubeRenderTarget, CubeCamera, Matrix4 } from 'three/webgpu';
import { uniform, uv, rtt, Fn, vec2, vec3, vec4, float, mix, smoothstep, max, min, floor, fract, dot, sin, cos, select, If, fwidth, screenCoordinate, materialReference,
  passTexture, ivec2, clamp, abs, normalize, reflect, getViewPosition, pmremTexture, DFGLUT, specularColorBlended, roughness, interleavedGradientNoise } from 'three/tsl';
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
    // (three's node gives its two pictures the type of the picture it reads and not the format: a colour in 4 bytes,
    // hd3d-gpu.js hdrPic, has three channels, and that type with four is no format at all. Its pictures stay half
    // floats, which a trail fading a little each frame needs the steps of: the picture read says it is one while
    // the node looks)
    const ub = n.updateBefore; n.updateBefore = function (frame) { const map = this.textureNode.value, t = map?.type; if (map) map.type = HalfFloatType; try { return ub.call(this, frame); } finally { if (map) map.type = t; } };
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
  const keep = fn => { const t = rtt(ch.hdrOut ? ch.hdrOut(fn) : fn, 1, 1, ch.pic3 || HALF); t.renderTarget.gsPart = 'screen effects'; ch.fxR.push(t); return t; };
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
// The scene's pass writes one more picture: each shiny pixel's mirror colour (what the material reflects head on,
// negative for a material with surroundings of its own, v.room()) and how smooth it is. three.js's screen-space
// reflections march rays from those pixels only; what they find is then laid over the picture the way the ray traced
// reflections are (hd3d-gpu-trace.js): where a ray found a thing, the thing takes the place of the sky that the
// material already shows there (both by the material's own share of reflected light), and where it found nothing the
// sky stays. Added on top of that sky instead, as it was, a floor showed the sky and the thing at once: washed out,
// and the search against the ray traced truth (scripts/tune.cjs) could only bring it closer by turning it down.
const SHINY = uniform(0).onObjectUpdate(({ object }) => (object?.userData?.gsReflect ? 1 : 0));
/** The extra picture's value for a material, in the scene pass's MRT (name the picture gsRefl). */
export function reflMRT(m) {
  if (!m.isMeshStandardMaterial && !m.isMeshStandardNodeMaterial) return vec4(0);
  return vec4(specularColorBlended.mul(SHINY).mul(m.envNode ? -1 : 1), float(1 + 1 / 64).sub(clamp(roughness, 0, 1)));
}
/**
 * The screen-space reflections' settings: how far a ray marches (metres), how thick a thing on the screen is taken
 * to be, how many steps (quality: the cost), how wide the fade at the screen's edges is, the brightest a found thing
 * may be (three's SSRNode); how strong the reflections are, how much of the sky a found thing takes the place of and
 * how wide a rough surface's blur is, as its cone's (laid over the picture here). For scripts/tune.cjs, whose search
 * against the ray traced reference sets others before the effects chain is built again. Not on gs: games don't reach it.
 */
export const SSR_SETTINGS = { maxDistance: 20, thickness: .05, quality: .5, screenEdgeFade: .18, maxLuminance: 9, intensity: 1.05, replace: 1, blur: 1 };
const OWN_SSR = ['maxDistance', 'thickness', 'quality', 'screenEdgeFade', 'maxLuminance'];
const VOGEL = Array.from({ length: 6 }, (_, i) => { const r = Math.sqrt((i + .5) / 6), a = i * 2.399963; return [r * Math.cos(a), r * Math.sin(a)]; });
const ROUGH_MAX = .65, ROUGH_FADE = .45;   // (as the ray traced reflections: rougher than this a surface shows no reflection worth a ray)
/** The scene's colour with the reflections laid over it (a picture node). */
export function reflStage(ch, sp, colT) {
  const R = sp.getTextureNode('gsRefl'), C = colT, dT = sp.getTextureNode('depth'), nT = ch.nrmN, S = SSR_SETTINGS;
  const shiny = select(abs(R.r).add(abs(R.g)).add(abs(R.b)).greaterThan(1e-3), float(1), float(0)), rough = clamp(float(1 + 1 / 64).sub(abs(R.a)), 0, 1);
  const n = ch.ssrN = ssr(C, dT, nT, { metalnessNode: shiny, roughnessNode: rough, camera: ch.cam });
  for (const k of OWN_SSR) n[k].value = S[k];
  n.intensity.value = 1; n.blurQuality = 1;   // (the strength is laid on below; its own blurred picture isn't read, so its blur is the cheapest)
  const U = ch.ssrU = { invProj: uniform(new Matrix4()), camWorld: uniform(new Matrix4()), focal: uniform(1), envI: uniform(1), maxD: uniform(S.maxDistance), k: uniform(S.intensity), sky: uniform(S.replace), blur: uniform(S.blur) };
  // (what a ray found, as three's SSRNode leaves it: the thing's colour faded by how far the ray went and by its own
  // rough Fresnel term, which come off again here; how far, in alpha, nothing where it found nothing)
  const raw = passTexture(n, n.getRenderTarget().texture), env = ch.scene.environment, envs = ch.ssrEnvs = [];
  const envAt = (dir, r) => { if (!env) return vec3(0); const e = pmremTexture(env, dir, r); envs.push(e); return e.rgb.mul(U.envI); };
  const lay = Fn(() => {
    const q = uv(), c = C.sample(q), r4 = R.sample(q), out = vec3(c.rgb).toVar(), f0 = abs(r4.rgb), smooth = abs(r4.a);
    If(f0.r.add(f0.g).add(f0.b).greaterThan(1e-3).and(smooth.greaterThan(1 + 1 / 64 - ROUGH_MAX)), () => {
      const rg = clamp(float(1 + 1 / 64).sub(smooth), 0, 1).toVar();
      const vp = getViewPosition(q, dT.sample(q).r, U.invProj).toVar(), nv = normalize(nT.sample(q)).toVar(), vd = normalize(vp).negate().toVar(), nov = clamp(dot(nv, vd), 0, 1).toVar();
      const rr = reflect(vd.negate(), nv), fres = max(dot(vd.negate(), rr).add(1).mul(.5), .05).toVar(), zc = vp.z;
      const sz = vec2(raw.size(0)), top = ivec2(sz).sub(1), acc = vec3(0).toVar(), cov = float(0).toVar(), ws = float(0).toVar();
      // each found pixel counts by how near its surface is to this one's (the wall behind says nothing about the floor)
      const tap = (px, w0) => {
        const p = clamp(px, ivec2(0), top), s = raw.load(p), tq = vec2(p).add(.5).div(sz), z = getViewPosition(tq, dT.sample(tq).r, U.invProj).z;
        const w = w0.mul(max(float(1).sub(abs(z.sub(zc)).div(abs(zc).mul(.04).add(.03))), .002)).toVar(), got = select(s.a.greaterThan(0), float(1), float(0));
        const fall = clamp(float(1).sub(s.a.mul(nov).div(U.maxD)), 0, 1);
        acc.addAssign(s.rgb.div(fres).mul(w).mul(got)); cov.addAssign(fall.mul(fall).mul(w).mul(got)); ws.addAssign(w);
      };
      const hp = q.mul(sz).sub(.5), b = floor(hp), fr = hp.sub(b), bi = ivec2(b);
      tap(bi, fr.x.oneMinus().mul(fr.y.oneMinus())); tap(bi.add(ivec2(1, 0)), fr.x.mul(fr.y.oneMinus())); tap(bi.add(ivec2(0, 1)), fr.x.oneMinus().mul(fr.y)); tap(bi.add(ivec2(1, 1)), fr.x.mul(fr.y));
      // a rough surface: more from round about, over a circle as wide as its blur is at the found thing's distance
      If(rg.greaterThan(.07), () => {
        const tn = raw.load(clamp(ivec2(hp.add(.5)), ivec2(0), top)).a, th = select(tn.greaterThan(0), tn, U.maxD), dist = vp.length();
        const rad = clamp(rg.mul(rg).mul(1.3).mul(U.blur).mul(th.div(th.add(dist))).mul(U.focal).mul(sz.y), 1, 14), ang = interleavedGradientNoise(screenCoordinate.xy).mul(6.2832), cs = cos(ang), sn = sin(ang);
        for (const [x, y] of VOGEL) tap(ivec2(floor(hp.add(.5).add(vec2(cs.mul(x).sub(sn.mul(y)), sn.mul(x).add(cs.mul(y))).mul(rad)))), float(.6));
      });
      const k = float(1).div(max(ws, 1e-4)), fab = DFGLUT({ roughness: rg, dotNV: nov }), W = f0.mul(fab.x).add(fab.y);
      // what the material drew there already: its surroundings along the mirror direction (as three.js reads them)
      const rv = normalize(mix(rr, nv, rg.mul(rg).mul(rg).mul(rg))), own = r4.r.add(r4.g).add(r4.b).lessThan(0);
      const sky = select(own, vec3(0), envAt(normalize(U.camWorld.mul(vec4(rv, 0)).xyz), rg));
      const fade = smoothstep(ROUGH_MAX, ROUGH_FADE, rg).mul(select(own, float(.6), float(1)));
      out.addAssign(W.mul(acc.mul(k).sub(sky.mul(cov.mul(k).mul(min(U.sky, 1))))).mul(fade).mul(U.k));
    });
    return vec4(max(out, 0), 1);
  })();
  ch.ssrT = rtt(ch.hdrOut ? ch.hdrOut(lay) : lay, 1, 1, ch.pic3 || HALF);
  ch.ssrT.renderTarget.gsPart = 'reflections';   // (hd3d.js gpuTime: the chip's time by pass; three's own SSR passes are found by name)
  return ch.ssrT;
}
export function reflFrame(ch, w, h, scale) {
  if (!ch.ssrT) return;
  ch.ssrT.setSize(w, h);
  if (ch.ssrN.resolutionScale !== scale) ch.ssrN.resolutionScale = scale;
  const U = ch.ssrU, cam = ch.cam, e = ch.scene.environment;
  U.invProj.value.copy(cam.projectionMatrixInverse); U.camWorld.value.copy(cam.matrixWorld); U.focal.value = cam.projectionMatrix.elements[5] * .5;
  U.envI.value = ch.scene.environmentIntensity ?? 1;
  if (e) for (const x of ch.ssrEnvs || []) if (x.value !== e) x.value = e;
}
export function reflDispose(ch) { ch.ssrN?.dispose(); ch.ssrT?.renderTarget?.dispose(); ch.ssrN = ch.ssrT = ch.ssrU = ch.ssrEnvs = null; }

/* ---------- light probes (v.bakeLight()) ---------- */
/** The surroundings of a point as a cube picture on this renderer (three's LightProbeGenerator reads the light from it). */
export function bakeProbe(r, scene, at, size) {
  const rt = new CubeRenderTarget(size, { type: HalfFloatType }), cc = new CubeCamera(.05, 400, rt);
  cc.position.copy(at); scene.add(cc); cc.updateMatrixWorld(true);
  try { cc.update(r, scene); } catch (e) { rt.dispose(); throw e; } finally { cc.removeFromParent(); }
  return rt;
}
