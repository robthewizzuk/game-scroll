// The puddle mirror (v.mirror(): Saltline's way, 2026-11-16): flat ground that is wet shows what stands round it, upside
// down in its puddles, its soaked band and the water in its joints, on phones that don't ray trace their reflections.
//   - The scene is drawn a second time, small (a third to a half of the 3D's size each way), from the camera turned over
//     in the ground's plane, with what lies under that plane cut away by the camera's own near plane (oblique: Lengyel's
//     way, for each way depth may run), and the mirror's own meshes left out. Its picture is mipmapped, so rough water
//     (the soaked band, a film in the cracks) reads it blurred, and the water's ripples and rain rings bend it.
//   - Where the water is (the puddle sums in hd3d.js AIR_WET and hd3d-gpu.js gpuWet) the picture is laid on in place of
//     the sky the material reflects there, by the water's own Fresnel term: what the picture holds, less the sky it
//     covers. WebGL takes that sky from the material's own surroundings; WebGPU's mirror picture has it taken off in a
//     small pass of its own first (hd3d-gpu-mirror.js), so the ground's material reads one more picture, not two.
//   - Only while something is wet (the weather's puddles, or wet painted ground with water in its grooves), from medium
//     up (not on low), with the camera above the plane, and not where reflections are ray traced (they show the puddles
//     then). The picture is drawn every frame on high and up, every other frame on medium.
// Kit use only: hd3d.js runs it; games call v.mirror(mesh) (gs.outdoors.Ground does it for its ground).
import { Matrix4, Vector3, Vector4, PerspectiveCamera } from 'three';

/** The mirror's numbers, read by every material that shows it: on (0..1), the most blur (mip level), the picture, its view-projection. */
export const MIRROR = { on: 0, lod: 6, tex: null, vp: new Matrix4(), y: 0, frame: 0 };

const R = new Matrix4(), P = new Vector3(), L = new Vector3(), T = new Vector3(), C = new Vector4(), Q = new Vector4(), IP = new Matrix4();
/**
 * The camera turned over in the plane y = h (the drawing's own numbers), into out, its projection cut at that plane.
 * depth: 'gl' (near -1, far 1), 'gpu' (near 0, far 1) or 'rev' (near 1, far 0). False when the camera is not above the plane.
 */
export function mirrorCamera(cam, h, out, depth) {
  cam.updateMatrixWorld(); P.setFromMatrixPosition(cam.matrixWorld);
  if (P.y <= h + .01) return false;
  R.extractRotation(cam.matrixWorld);
  L.set(0, 0, -1).applyMatrix4(R).add(P);
  out.position.set(P.x, 2 * h - P.y, P.z);
  out.up.set(0, 1, 0).applyMatrix4(R); out.up.y = -out.up.y;
  T.set(L.x, 2 * h - L.y, L.z); out.lookAt(T);
  out.near = cam.near; out.far = cam.far; out.coordinateSystem = cam.coordinateSystem;
  if ('_reversedDepth' in cam) out._reversedDepth = cam._reversedDepth;
  out.updateMatrixWorld();
  const e = out.projectionMatrix.copy(cam.projectionMatrix).elements;
  e[8] *= -1; e[12] *= -1;   // (the picture is turned left to right as well: a jitter or a lens shift with it)
  oblique(out.projectionMatrix, h, out.matrixWorldInverse, depth);
  out.projectionMatrixInverse.copy(out.projectionMatrix).invert();
  return true;
}
/** Make the plane y = h (seen from camera matrix V) the projection's near plane, keeping its far corner where it was. */
export function oblique(proj, h, V, depth) {
  planeIn(V, h, C);   // (the plane in the camera's numbers, the side above it positive)
  const p = proj.elements, far = depth === 'rev' ? 0 : 1;
  IP.copy(proj).invert();
  Q.set(Math.sign(C.x), Math.sign(C.y), far, 1).applyMatrix4(IP);
  const wq = p[3] * Q.x + p[7] * Q.y + p[11] * Q.z + p[15] * Q.w, cq = C.dot(Q), a = (depth === 'gl' ? 2 : 1) * wq / cq;
  // the third row anew: 'gl' a C - row 4 (near -1), 'gpu' a C (near 0), 'rev' row 4 - a C (near 1); row 4 stays (no garbage a frame)
  const k = depth === 'gl' ? -1 : depth === 'gpu' ? 0 : 1, sg = depth === 'rev' ? -a : a;
  p[2] = sg * C.x + k * p[3]; p[6] = sg * C.y + k * p[7]; p[10] = sg * C.z + k * p[11]; p[14] = sg * C.w + k * p[15];
}
// the plane y = h (normal up) in the numbers of the camera whose view matrix is V: n' = V's rotation times n, d' = -(n' . (V times a point on it))
const PT = new Vector3(), NV = new Vector3();
function planeIn(V, h, out) {
  const e = V.elements;
  NV.set(e[4], e[5], e[6]).normalize();
  PT.set(0, h, 0).applyMatrix4(V);
  out.set(NV.x, NV.y, NV.z, -NV.dot(PT));
}
/** A camera for the mirror (its class: three's own, which either renderer draws with). */
export const mirrorCam = () => new PerspectiveCamera();
/** How a camera's depth runs, as oblique() wants it. */
export const depthOf = (cam, webgpu) => !webgpu ? 'gl' : cam.reversedDepth || cam._reversedDepth ? 'rev' : 'gpu';
