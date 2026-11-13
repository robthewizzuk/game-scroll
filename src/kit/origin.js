// The world's centre moved along with the camera (a floating origin), so far-off places don't shake.
//
// A phone's graphics chip works in 32-bit floats: about seven digits. A point 20 km from the world's centre is
// kept to about 2 mm, and what is worked out from it every frame (a person's bones, a shadow, the camera
// looking at them) wobbles by that much: close up, a face shakes by a few pixels. Rapier, the physics, is the
// same. JavaScript's own numbers have sixteen digits, so where things are in the game is never the trouble,
// only the moment those numbers go to the chip.
//
// So nothing moves in the game. While a Next Gen view draws (HDView.render), the scene is drawn as if its
// centre were near the camera: every thing's place on the chip is worked out from the camera's
// neighbourhood (scene.matrixWorld is a step back by ORIGIN for that time), and put back after. Shaders that
// make patterns from where a point is in the world (ground, hills, rock, clouds, wet ground) add ORIGIN back,
// so the patterns stay where they were. World3D keeps its bodies in Rapier the same way, near its own centre,
// and gives and takes every place in the world's own numbers.
//
// The centre stays at 0, 0, 0 (nothing changes and nothing is spent) until the camera is HD.origin metres
// (1024) from it, then moves to the camera in steps of 256 m, and stays put until the camera has gone as far
// again. Only x and z move: worlds are wide, not tall, so heights (water, mist, snow lines) are never touched.

import { Vector3 } from 'three';

/** Where the drawing's centre is in the world now (while a view draws): what world-pattern shaders add back. */
export const ORIGIN = new Vector3();
/** The same, as a GLSL uniform (one object shared by every material that uses it). */
export const ORIGIN_U = { value: ORIGIN };
/**
 * The uniform's GLSL declaration, for the head of any shader text that reads gsOrigin. One shader can carry
 * several of the kit's effects that each read it (a ground look, the air, a room's reflections), and GLSL
 * won't have a uniform declared twice, so it is declared only by the first.
 */
export const ORIGIN_GLSL = '\n#ifndef GS_ORIGIN\n#define GS_ORIGIN\nuniform vec3 gsOrigin;\n#endif\n';
/** How far (metres) the camera goes from the centre before it moves (0: never); the steps it moves in. */
export const ORIGIN_SET = { far: 1024, step: 256, at: null };

const near = (a, b) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;

/**
 * Where a view's centre should be with its camera at p (world numbers): `at` (a Vector3 the view keeps) is moved
 * when the camera has gone far enough from it. Returns true if it moved.
 */
export function follow(at, p, set = ORIGIN_SET) {
  const was = { x: at.x, z: at.z };
  if (set.at) at.set(set.at.x ?? 0, 0, set.at.z ?? 0);   // (tests, the frame lab: a centre given outright)
  else if (!(set.far > 0)) at.set(0, 0, 0);
  else if (Math.abs(p.x - at.x) > set.far || Math.abs(p.z - at.z) > set.far) {
    const s = Math.max(1, set.step || 256);
    at.set(Math.round(p.x / s) * s, 0, Math.round(p.z / s) * s);
  }
  return !near(was, at);
}
