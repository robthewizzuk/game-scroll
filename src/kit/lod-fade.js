// Fades between detail levels instead of popping (Godot's and Bevy's visibility ranges, Unity's LOD cross-fade):
// while a thing changes level, both levels are drawn for a moment, each in a fine screen-space dither that is
// the other's exact complement, so every pixel shows one level or the other and nothing is drawn twice. Over
// FADE.s seconds the new level's share goes from none to all. Under SGSR 2 the dither moves each frame and the
// upscaler's history blends it into a smooth cross-fade; without it the pattern stands still (no crawl).
//
// Only what is changing level is drawn with the dither: its meshes are drawn for the frame with a twin of each
// material that has the dither in it (a discard), so nothing else pays for it, not even the early depth test a
// discard costs a graphics chip. A twin's shader is built in the background the first time it is wanted;
// until it is in, the change waits a moment, then pops as before (never a frame stopped for a shader, never a
// thing hidden while one builds).
//
// Two kinds of thing fade:
//   - a whole object between meshes (a person's or an animal's levels: gs.models.human, creature): fadeLevels()
//     below, the value on each mesh (userData.gsFadeV), WebGL and WebGPU.
//   - single copies in a gs.props set (WebGPU): hd3d-gpu.js gpuProps and props-gpu.js draw the copies that are
//     changing level in short lists of their own, the value a copy (an attribute, gsFade).
// The shadows: of the two levels the one with the larger share casts (WebGPU: in the shadow pass the twin keeps
// only that; WebGL: castShadow for the frame), so a shadow changes once, halfway, not twice over or not at all.
// Kit use only; the switch is the view's HD.lodFade (true by default), the time HD.lodFadeTime.

import { Vector2, MathUtils } from 'three';

/** on: fades at all; s: how long one takes (seconds); frame: the dither's step this frame (0 while nothing smooths it over frames); n: frames drawn. */
export const FADE = { on: true, s: .4, frame: 0, n: 0, wait: .7 };
/** Not fading: everything kept (x: share, y: +1 coming in, -1 going out). */
export const WHOLE = new Vector2(1, 1);

// ---------------------------------------------------------------- whole objects between meshes

// The things fading now: root -> { from, to (lists of objects shown at each level), t (0..1), at (ms), wait (s), done }
export const FADING = new Map();
// The things that can fade (each person and animal), and when a view last drew each (frames): a level change
// fades only for a thing that was on screen last frame, so one coming into sight, out of a pool or a crowd's
// bake, takes its level at once.
const ROOTS = new Set(), PARTS = new WeakMap();
let drawn = 0;
/** Marks root as a thing whose level changes can fade (gs.models.human and creature call it); parts(): every object any of its levels shows. */
export function fadeable(root, parts = null) { ROOTS.add(root); root.userData.gsSeen = -9; if (parts) PARTS.set(root, parts); return root; }
/** Each fadeable thing a view drew this frame (after fadeStep), with every object its levels show: fn(root, parts); false from fn stops. */
export function fadeAheadList(fn) { for (const r of ROOTS) if (r.userData.gsSeen === drawn && fn(r, PARTS.get(r)?.() || r.lods || []) === false) return; }
// shown: the root and everything above it visible, in a scene
function shown(o) { let x = o; for (; x; x = x.parent) { if (!x.visible) return false; if (x.isScene) return true; } return false; }

/**
 * root changes level: from and to are the objects shown at each (a mesh and anything shown with it only at that
 * level). Both are shown while the fade runs; done() runs when it ends (the old ones hidden by then), or at once
 * when there is no fade (fades off, nothing on screen to see it). A thing already fading: going back to the level
 * it came from turns the fade round; another level ends it first. Returns true if it fades.
 */
export function fadeLevels(root, from, to, done) {
  const f = FADING.get(root);
  if (f) {
    if (same(to, f.from)) {   // (back again: the fade turns round; one that had not begun, its shaders still building, just ends)
      const k = f.from; f.from = f.to; f.to = k; f.t = 1 - f.t; f.done = done;
      if (f.t < .99) return true;
      finish(root, f); return false;
    }
    finish(root, f);
  }
  const on = FADE.on && root.userData.gsSeen >= drawn - 1 && shown(root);
  if (!on) { show(from, false); show(to, true); done?.(); return false; }
  show(to, true);
  FADING.set(root, { from, to, t: 0, at: performance.now(), t0: performance.now(), wait: 0, done });
  return true;
}
const same = (a, b) => a.length === b.length && a.every((o, i) => o === b[i]);
const show = (list, on) => { for (const o of list) if (o) o.visible = on; };
function finish(root, f) {
  FADING.delete(root);
  show(f.from, false); show(f.to, true);
  for (const L of [f.from, f.to]) for (const o of L) o?.traverse(m => { if (m.userData.gsFadeV) m.userData.gsFadeV = null; });
  f.done?.();
}
/** Ends every fade at once (a game's reset, tests). */
export function fadesDone() { for (const [r, f] of [...FADING]) finish(r, f); }

/**
 * A view's frame (hd3d.js): marks the fadeable things it shows as seen, moves each fade it shows along, ends the
 * ones that have waited too long for their shaders (or are not in any scene now), and lists the meshes to draw
 * dithered this frame: [mesh, value, casts] (value: x the share it shows, y +1 coming in / -1 going out; casts:
 * the level that casts the shadow). ready(mesh) says whether the dithered twins of a mesh's materials are built
 * (and starts their build if not). smooth: something blends frames (SGSR 2), so the dither moves each frame.
 */
export function fadeStep(scene, ready, smooth, out = []) {
  out.length = 0;
  drawn++; FADE.n++; FADE.frame = FADE_GL.gsFadeFrame.value = smooth ? FADE.n & 15 : 0;
  for (const r of ROOTS) {
    if (shown(r) && inScene(r, scene)) r.userData.gsSeen = drawn;
    else if (!r.parent && drawn - r.userData.gsSeen > 600) ROOTS.delete(r);   // (thrown away: it joins again if its level is set)
  }
  if (!FADING.size) return out;
  const now = performance.now();
  for (const [root, f] of [...FADING]) {
    if (!inScene(root, scene)) { if (now - f.t0 > 2000) finish(root, f); continue; }   // (another view's, or one no view draws now)
    const dt = Math.min(.25, Math.max(0, (now - f.at) / 1000)); f.at = now;
    // the meshes drawn at each level now, and whether their dithered shaders are in
    const list = [];
    let ok = true;
    for (let side = 0; side < 2; side++) for (const o of side ? f.to : f.from) o?.traverseVisible(m => { if (m.isMesh && m.material) { list.push(m, side); if (!ready(m)) ok = false; } });
    if (!ok) {   // (the new level waits, hidden, while they build; the old one stays whole meanwhile)
      f.wait += dt;
      if (f.wait > FADE.wait || !FADE.on) { finish(root, f); continue; }
      for (let i = 0; i < list.length; i += 2) if (list[i + 1]) out.push(list[i], null, false);
      continue;
    }
    f.t += dt / Math.max(.01, FADE.s);
    if (f.t >= 1) { finish(root, f); continue; }
    for (let i = 0; i < list.length; i += 2) {
      const m = list[i], into = list[i + 1] === 1, v = m.userData.gsFadeV ||= new Vector2();
      v.set(f.t, into ? 1 : -1);
      out.push(m, v, into ? f.t >= .5 : f.t < .5);
    }
  }
  return out;
}
function inScene(o, scene) { for (let x = o; x; x = x.parent) if (x === scene) return true; return false; }
/** Things fading now (HD.info.fading). */
export const fadingCount = () => FADING.size;

// ---------------------------------------------------------------- WebGL: a material's dithered twin

// The twin is the material itself with the dither added: an object made on top of it (its prototype), so every
// setting, colour and picture is read from the material as it is now; its own id, version (the material's own
// plus its own changes) and listeners; and its program is the material's with the discard put in at the start of
// main(). The value for each mesh drawn with it goes in just before the draw (hookGL: three uploads a material's
// uniforms only when the material or the program changes, and the meshes fading share one twin).
export const FADE_GL = { gsFade: { value: new Vector2(1, 1) }, gsFadeFrame: { value: 0 } };
const GL_HEAD = 'uniform vec2 gsFade;\nuniform float gsFadeFrame;\n';
// (interleaved gradient noise, Jimenez 2014: an even spread of thresholds over every few pixels, and with the frame added a fresh one each frame)
const GL_KEEP = '\n  { vec2 gsFp = gl_FragCoord.xy + 5.588238 * gsFadeFrame; float gsFn = fract(52.9829189 * fract(dot(gsFp, vec2(.06711056, .00583715)))); if ((gsFn - gsFade.x) * gsFade.y >= 0.) discard; }\n';
const MAIN = /void\s+main\s*\(\s*(void)?\s*\)\s*\{/;
const GL_TWINS = new WeakMap();
let glIds = 0;
export function glTwin(base) {
  if (!base) return base;
  let t = GL_TWINS.get(base); if (t) return t;
  t = Object.create(base);
  Object.defineProperty(t, 'id', { value: 1e9 + glIds++ });
  t.uuid = MathUtils.generateUUID(); t._listeners = {};
  let own = 0;
  Object.defineProperty(t, 'version', { get: () => base.version + own, set(v) { own = v - base.version; }, configurable: true });
  t.onBeforeCompile = function (sh, r) {
    base.onBeforeCompile.call(this, sh, r);
    sh.uniforms.gsFade = FADE_GL.gsFade; sh.uniforms.gsFadeFrame = FADE_GL.gsFadeFrame;
    if (MAIN.test(sh.fragmentShader)) sh.fragmentShader = GL_HEAD + sh.fragmentShader.replace(MAIN, m => m + GL_KEEP);
  };
  t.customProgramCacheKey = function () { return base.customProgramCacheKey() + '|gsfade'; };
  const gone = () => { base.removeEventListener('dispose', gone); GL_TWINS.delete(base); t.dispose(); };
  base.addEventListener('dispose', gone);
  GL_TWINS.set(base, t);
  return t;
}
const ONE_GL = new WeakMap();
/** A mesh's material(s) as dithered twins (WebGL): the same list for the same materials. */
export function glTwins(o) { return twinList(o, ONE_GL, glTwin); }
/** The same through make(material) (WebGPU's twins: hd3d-gpu.js). */
export function twinList(o, cache, make) {
  const src = o.material;
  if (!Array.isArray(src)) return make(src);
  let c = cache.get(o);
  if (!c || c.src !== src || c.list.some((t, i) => t !== make(src[i]))) cache.set(o, c = { src, list: src.map(make) });
  return c.list;
}
// The value of the mesh being drawn into the twin's program (WebGL), just before its draw: three uploads it itself
// when it binds the program or turns to another material (the value is the shared uniform's), and when the
// twin's program is bound already, for the mesh before, it is put straight in. (Binding it here instead left
// three thinking it had: the camera and lights then never went into a program bound first this way.)
function glValue(renderer, scene, camera, geometry, material) {
  const v = this.userData.gsFadeV || WHOLE;
  FADE_GL.gsFade.value.copy(v);
  const p = renderer.properties.get(material)?.currentProgram, gl = renderer.getContext();
  if (p && gl.getParameter(gl.CURRENT_PROGRAM) === p.program) p.getUniforms().setValue(gl, 'gsFade', v);
}
/** Puts the value in before each draw of o (WebGL); gives back what to put back after the frame. */
export function hookGL(o) {
  const own = Object.hasOwn(o, 'onBeforeRender') ? o.onBeforeRender : undefined;
  o.onBeforeRender = own ? function (...a) { own.apply(this, a); glValue.apply(this, a); } : glValue;
  return own;
}
