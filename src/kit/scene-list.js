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
import { Object3D, Vector4 } from 'three';

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
// (and whether three's own walk does anything else on the way: a level of detail picks its child, a clipping group
// and a bundle group change how what is under them is drawn; a scene with one is drawn by three's own walk)
function gather(o, L) {
  if (thing(o)) L.things.push(o); else if (o.isLOD || o.isClippingGroup || o.isBundleGroup) L.plain = false;
  const c = o.children; for (let i = 0; i < c.length; i++) gather(c[i], L);
}
function listed(scene) {
  const t = top(scene), e = EDITS.get(t) || 0;
  let L = LISTS.get(scene);
  if (L && L.e === e && L.t === t) return L;
  if (!L) LISTS.set(scene, L = { e: 0, t: null, things: null, plain: true });
  // (a new array each time: a walk under way, whose step changed the scene, goes on through the list it began with)
  L.e = e; L.t = t; L.things = []; L.plain = true; gather(scene, L); listStats.built++;
  return L;
}
const listOf = scene => listed(scene).things;
const shown = (o, root) => { for (;;) { if (!o.visible) return false; if (o === root) return true; o = o.parent; if (!o) return false; } };
/** Each thing in the scene (what draws, and lights), shown or not: scene.traverse for them, in the same order. */
export function eachThing(scene, fn) { const T = listOf(scene); for (let i = 0; i < T.length; i++) fn(T[i]); }
/** Each thing that is shown (it and all its parents up to the scene visible): scene.traverseVisible for them. */
export function eachShown(scene, fn) { const T = listOf(scene); for (let i = 0; i < T.length; i++) if (shown(T[i], scene)) fn(T[i]); }
/** The scene's list itself (read only): a new array each time the scene was listed again, so a step can tell that something was added or taken out. */
export const thingsOf = scene => listOf(scene);
/** How many things the scene's list holds (tests). */
export const thingCount = scene => listOf(scene).length;

/**
 * three's drawing pipeline (WebGPU: `renderer.drawingPipeline`) with its walk made over the list. For each render,
 * the scene's picture, each shadow map and each part of one, three walks the whole scene: every bone and group
 * between the things, 10,700 parts in the square of 300 people, twice a frame or more (11 of the build machine's
 * 47 ms of code a frame there, 2026-11-13). This goes through the things alone and does for each what three's walk
 * does: shown (it and its parents), on a layer the camera sees, the group order of the nearest group the camera
 * sees above it, culled by the camera's view, and pushed in the same order, so the draws are the same. A scene
 * with a level of detail, a clipping group or a bundle group in it, and anything drawn that isn't a scene (a
 * full-screen pass), go through three's own walk. W: three/webgpu.
 */
export function listPipeline(W) {
  const v4 = new Vector4();
  return class ListPipeline extends W.StandardDrawingPipeline {
    project(o, camera, groupOrder, list, clip) {
      if (!o.isScene || this._bundleDepth > 0) return super.project(o, camera, groupOrder, list, clip);
      const L = listed(o);
      if (!L.plain) return super.project(o, camera, groupOrder, list, clip);
      if (o.visible === false) return;
      const T = L.things, cl = camera.layers, sort = this.renderer.sortObjects === true, M = this._projScreenMatrix;
      for (let i = 0; i < T.length; i++) {
        const t = T[i];
        if (t.visible === false || !t.layers.test(cl)) continue;
        // its parents up to the scene all shown; on the way, the group order three's walk would have handed down to it
        let p = t.parent, g = groupOrder, got = false;
        while (p !== o && p) { if (p.visible === false) break; if (!got && p.isGroup && p.layers.test(cl)) { g = p.renderOrder; got = true; } p = p.parent; }
        if (p !== o) continue;
        if (t.isGroup) continue;
        if (t.isLight) list.pushLight(t);
        else if (t.isSprite) {
          if (this.isCulled(t, camera) === false) {
            if (sort) v4.setFromMatrixPosition(t.matrixWorld).applyMatrix4(M);
            if (t.material.visible) this.pushRenderItem(list, t, t.geometry, t.material, g, v4.z, null, clip);
          }
        } else if (t.isLineLoop) continue;   // (three says it can't draw one, every frame)
        else if (t.isMesh || t.isLine || t.isPoints) {
          if (this.isCulled(t, camera) === false) {
            const { geometry, material } = t;
            if (sort) { if (geometry.boundingSphere === null) geometry.computeBoundingSphere(); v4.copy(geometry.boundingSphere.center).applyMatrix4(t.matrixWorld).applyMatrix4(M); }
            if (Array.isArray(material)) {
              const groups = geometry.groups;
              for (let k = 0; k < groups.length; k++) { const gr = groups[k], gm = material[gr.materialIndex]; if (gm && gm.visible) this.pushRenderItem(list, t, geometry, gm, g, v4.z, gr, clip); }
            } else if (material.visible) this.pushRenderItem(list, t, geometry, material, g, v4.z, null, clip);
          }
        }
      }
    }
  };
}
