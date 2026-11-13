// One list of a scene for all of a frame's steps.
// The view's steps (hd3d.js and the parts it calls) each walked the whole scene to find what they work on:
// the materials WebGPU has to draw, the lights, the shadow casters, what gets simpler far away, what waits for
// its shader, what can be hidden behind other things... eight walks a frame, ten with the detail scans. A
// square of 300 people with a skeleton each is 10,700 parts, nine in ten of them bones, and walking them took
// 40% of the engine's code time in that scene (Rob's Fold, 2026-11-13: 25 ms of code a frame).
// Here a scene is listed once, and listed again only after something in it was added, taken out or moved to
// another parent: three's add, remove and attach count that at the top of the tree they change. A walk goes
// through the things in the list (what draws, and the lights; not the bones and groups between them), in the
// scene's own order, and asks each one and its parents whether it is shown at that moment, as
// traverseVisible would have.
import { Object3D } from 'three';

const EDITS = new WeakMap(), LISTS = new WeakMap();
/** How many times a scene was listed (tests, probes). */
export const listStats = { built: 0 };
const top = o => { while (o.parent) o = o.parent; return o; };
/** Something under `o` changed parents without three's add, remove or attach (props.js swaps a mesh in place). */
export function sceneEdited(o) { const t = top(o); EDITS.set(t, (EDITS.get(t) || 0) + 1); }
{
  const P = Object3D.prototype;
  if (!P.gsCounted) {
    const add = P.add, remove = P.remove, attach = P.attach;
    P.add = function (o) { sceneEdited(this); return arguments.length > 1 ? add.apply(this, arguments) : add.call(this, o); };
    P.remove = function (o) { sceneEdited(this); return arguments.length > 1 ? remove.apply(this, arguments) : remove.call(this, o); };
    P.attach = function (o) { sceneEdited(this); return attach.call(this, o); };
    P.gsCounted = true;
  }
}
// what a walk visits: what draws (meshes, points, lines, sprites and anything else with a material) and lights
const thing = o => o.isMesh || o.isLight || o.isPoints || o.isLine || o.isSprite || o.material !== undefined;
function gather(o, T) { if (thing(o)) T.push(o); const c = o.children; for (let i = 0; i < c.length; i++) gather(c[i], T); }
function listOf(scene) {
  const t = top(scene), e = EDITS.get(t) || 0;
  let L = LISTS.get(scene);
  if (L && L.e === e && L.t === t) return L.things;
  if (!L) LISTS.set(scene, L = { e: 0, t: null, things: null });
  // (a new array each time: a walk under way, whose step changed the scene, goes on through the list it began with)
  L.e = e; L.t = t; L.things = []; gather(scene, L.things); listStats.built++;
  return L.things;
}
const shown = (o, root) => { for (;;) { if (!o.visible) return false; if (o === root) return true; o = o.parent; if (!o) return false; } };
/** Each thing in the scene (what draws, and lights), shown or not: scene.traverse for them, in the same order. */
export function eachThing(scene, fn) { const T = listOf(scene); for (let i = 0; i < T.length; i++) fn(T[i]); }
/** Each thing that is shown (it and all its parents up to the scene visible): scene.traverseVisible for them. */
export function eachShown(scene, fn) { const T = listOf(scene); for (let i = 0; i < T.length; i++) if (shown(T[i], scene)) fn(T[i]); }
/** How many things the scene's list holds (tests). */
export const thingCount = scene => listOf(scene).length;
