// Reversed depth on WebGPU (gpu.js REVERSED): the Next Gen renderer keeps depth in 32-bit floats that run from 1 at
// the camera's near plane to 0 at its far one. A float has most of its steps near 0, and a perspective depth crowds
// the far half of the world into the last thousandth of its range: the other way round, the float's fine steps land
// where the depths are crowded, and two surfaces a hand apart stay apart at 20 km (24-bit depth running forward
// tells them apart to about 1 km with a near plane at 10 cm). three turns round its own side: the cameras'
// projection matrices, the depth tests, the clears, the shadow maps, and its nodes that read depth
// (getViewPosition, perspectiveDepthToViewZ). The kit's own shaders that read a depth picture by hand use these.
//
// In three's projection the reversed depth is exactly 1 minus the forward one, so a reader that wants the depth as
// it always ran takes fwdDepth(): what it gets has a 32-bit float's steps near 1 (6e-8, as 24-bit depth had), which
// is what those readers were written for. The gain is in the depth test, where surfaces are told apart.
import { Fn, float, isBackgroundDepth } from 'three/tsl';

/** A depth read from a picture this renderer drew, as it ran before reversed depth: 0 at the near plane, 1 at the far one and where nothing was drawn. */
export const fwdDepth = d => Fn(b => b.renderer.reversedDepthBuffer === true ? float(1).sub(d) : float(d))();
/** Whether a depth read from a picture is where nothing was drawn (the far plane). */
export const noDepth = isBackgroundDepth;   // (three's own, which its effect nodes use)
