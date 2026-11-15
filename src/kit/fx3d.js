// 3D extras for Console, Next Gen and AR games. Everything here draws on WebGL and on WebGPU.
//  - text3d(): sharp text inside the 3D world (text3d.js: distance-field letters made from the app's
//    fonts with tiny-sdf): scores over heads, signs, labels. Any gs.fonts font works.
//  - Particles3D: 3D particle effects (particles3d.js): fire, smoke, sparks, explosions, magic, snow.
//  - Impacts: shots landing by what they hit, muzzle flashes and spent cases (impacts.js).
//  - outline / glitch / trails / focus / pixelate: extra screen effects for Next Gen views (three.js's
//    own passes on WebGL; the same effects as nodes on WebGPU, hd3d-gpu.js).
//
//   const { text3d, Particles3D, outline } = gs.fx3d;
//   reset() {                                    // make them in make() or reset()
//     fx = new Particles3D(view.scene);
//     torch = fx.fire({ x: 0, y: 1, z: 0 });     // keeps burning; torch.stop() / torch.remove()
//     label = text3d('PLAYER 1', { size: .3, color: '#fff' }); hero.add(label); label.position.y = 2;
//     outline(view, [chest], { color: '#ffd400' });   // Next Gen only: a glowing edge round things
//   }
//   update(dt) { fx.update(dt); }
//   on a hit:  fx.boom(pos);  fx.sparks(pos);
//
// The screen effects' WebGL passes load the first time a game needs them (the app shows "Loading…"
// meanwhile), and so does a font that isn't one of the app's own two.

import { lazy } from './lazy.js';
import { Vector2 } from 'three';
import { Text3D } from './text3d.js';
export { Particles3D } from './particles3d.js';
export { Impacts } from './impacts.js';
const libs = lazy('3D effects', () => import('./fx3d-libs.js'));
export const loadFx3d = () => libs.load();

/* ---------- text in the 3D world ---------- */
/**
 * A text mesh: add it to your scene or to a model. Options: size (height of a capital letter in
 * world units), color, font: 'regular' | 'bold' | 'pixel' or any gs.fonts name ('Bangers', or
 * ['Fredoka', 700] for a weight), align: 'left' | 'center' | 'right', outline (width in world
 * units, e.g. .04) and outlineColor, maxWidth (wraps at spaces), face: true to always face the
 * camera (a label). Change label.text = 'NEW' (or color, size, outline...) and call label.sync().
 * label.width and label.height say how big it came out.
 */
export function text3d(str, o) { return new Text3D(str, o); }

/* ---------- extra screen effects (Next Gen views) ---------- */
// each pass says what it is (gsFx), so a view on WebGPU draws the same effect as nodes (hd3d-gpu.js
// GpuChain), reading its numbers from the same pass a game holds and changes
let fxId = 0;
function addPass(view, pass, kind) {
  pass.gsFx = { kind, id: ++fxId };
  (view.extras ||= []).push(pass);
  pass.remove = () => { view.extras = view.extras.filter(p => p !== pass); pass.dispose?.(); };
  return pass;
}
/** A glowing outline round objects (pickups, the selected unit). pass.selectedObjects = [...] changes them. */
export function outline(view, objects, { color = '#ffffff', hidden = '#444444', strength = 3, thickness = 1, pulse = 0 } = {}) {
  const L = libs.get(), p = new L.OutlinePass(new Vector2(256, 256), view.scene, view.cam, objects);
  p.visibleEdgeColor.set(color); p.hiddenEdgeColor.set(hidden); p.edgeStrength = strength; p.edgeThickness = thickness; p.pulsePeriod = pulse;
  return addPass(view, p, 'outline');
}
/** A digital glitch (hits, hacking, a broken robot). Remove it after a moment: const g = glitch(v); later g.remove(). */
export function glitch(view, { wild = false } = {}) { const L = libs.get(), p = new L.GlitchPass(); p.goWild = wild; return addPass(view, p, 'glitch'); }
/** Motion trails (speed, dreams, being dizzy). damp 0..1: how long the trail lingers (pass.damp = .9 changes it). */
export function trails(view, damp = .85) {
  const L = libs.get(), p = new L.AfterimagePass(damp);
  if (!('damp' in p)) Object.defineProperty(p, 'damp', { get: () => p.uniforms.damp.value, set: v => { p.uniforms.damp.value = v; } });
  return addPass(view, p, 'trails');
}
/**
 * Depth of field: things `focus` units from the camera are sharp, the rest blurs (by up to maxblur
 * of the screen's height; a smaller aperture keeps more in focus). It sets the view's own v.focus,
 * so it is the same on WebGL and WebGPU; f.remove() turns it off, f.focus = 4 moves it.
 */
export function focus(view, { focus: at = 10, aperture = .002, maxblur = .01 } = {}) {
  const f = {
    get focus() { return view.focus?.at; }, set focus(v) { if (view.focus) view.focus.at = v; },
    remove() { if (view.focus === spec) view.focus = null; },
  };
  const spec = view.focus = { at, range: at * .15, depth: Math.max(.1, Math.min(2, .001 / Math.max(aperture, 1e-5))), blur: maxblur * 640 };
  return f;
}
/** Big chunky pixels (a retro look or a transition). size: pixel size in screen pixels (pass.size = 8 changes it). */
export function pixelate(view, size = 4) {
  const L = libs.get();
  const p = new L.ShaderPass({
    uniforms: { tDiffuse: { value: null }, res: { value: new Vector2(1, 1) }, size: { value: size } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 res; uniform float size; varying vec2 vUv; void main(){ vec2 d = size / res; gl_FragColor = texture2D(tDiffuse, d * (floor(vUv / d) + .5)); }',
  });
  const set = p.setSize.bind(p); p.setSize = (w, h) => { set(w, h); p.uniforms.res.value.set(w, h); };
  Object.defineProperty(p, 'size', { get: () => p.uniforms.size.value, set: v => { p.uniforms.size.value = v; } });
  return addPass(view, p, 'pixelate');
}
