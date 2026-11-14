// Frame generation for Next Gen and AR views on WebGPU: the game draws real frames at 60 fps (or 45, 40,
// 30) and this fills the refreshes in between on a fast screen (90, 120 or 144 Hz), so play looks as
// smooth as the screen for a few milliseconds of compute instead of whole extra frames.
//
// No neural network: every pixel is moved along its own motion (three.js's per-pixel velocity, so
// moving things move, not just the camera), with depth deciding what is in front. The method follows
// the published free ones: AMD FSR 3 frame interpolation (MIT) for the forward splat of motion vectors
// with a depth-ordered atomic min and the background-first hole fill, its optical flow field, scene
// change check and inpainting pyramid, and Mob-FGSR (SIGGRAPH 2024) for doing it cheaply on phones from
// the game's own motion and depth. Written fresh in TSL (three.js's node language) so it runs as WebGPU
// compute, beside SGSR 2.
//
//   scenePass.setMRT(frameGenMRT());                 // the scene's pass writes motion and a see-through mask too
//   const fg = new FrameGen(renderer);               // kit use: hd3d-gpu.js GpuChain makes one per Next Gen / AR view
//   after each real frame:  fg.real({ color, velocity, reactive, depth, renderSize, outputSize, camera, jitter, jitterDelta })
//   then fg.make(t) and draw fg.output: t is the moment to show, 0 the last real frame and 1 the newest
//   (0 < t < 1 is in between, which needs fg.keep() once after the last made frame of a pair and
//   before the next real frame; t > 1 is a guess past the newest, with no added delay)
// hd3d-gpu.js decides what each refresh shows and src/main.js calls it on the refreshes between real
// frames (src/kit/speed.js says when frame generation is on).
//
// Motion: the camera's turn is followed exactly (a rotation, from the camera's last three frames),
// and the rest moves along a curve through where each pixel was in the last three frames (only the
// sideways bend: spins and arcs, never a speed-up that would overshoot). Past the newest frame a thing
// that has been slowing down is guessed to keep slowing down.
//
// Two modes: 'blend' (interpolation) shows each real frame a refresh late but has the fewest smears;
// 'ahead' (extrapolation) adds no lag, for reflex and rhythm games, and its edges are a little softer
// where things uncover. Kit use only: games never see it, the app turns it on (Settings › Frame
// generation) and a game can say frameGen: false (or 'ahead') in its definition.
//
// See-through things and glowing particles (transparent or added-light materials) have no single
// motion: the background shows through them. frameGenMRT() keeps them out of the motion picture (the
// background's motion stays) and marks where they are (reactive); there the made frame shows the
// newest real frame unmoved, so a glass edge never smears or shows twice. Glowing particles that say how
// they move (particleMotion(), as gs.hd's GPU sparks do) are moved along their own motion instead, where
// the last frame shows the same spark where it says it came from, so sparks move at the screen's rate
// too. Smoke (ordinary see-through blending) isn't moved along its own motion: that dragged the ground
// behind it along, which scored worse against the truth than leaving it (scripts/framegen-test.cjs --hard).
// It and glass move with what is behind them where that matches the last frame better than standing still.
//
// What the game's motion doesn't describe (a shadow sliding over still ground, a scrolling texture, a
// reflection, a picture moving on a still screen) is read from the pictures: an optical flow, block matching
// coarse to fine once per pair of real frames, searched only in the blocks the game's motion doesn't already
// match (most of a picture: cheap), then to a pixel round what it found, so a small thing moving unlike what
// is round it is found too. It is used per pixel only where it matches both frames clearly better than the
// game's motion, with both ends on the same surface (FSR 3 mixes its two motions the same way, more coarsely),
// and where what it shows is a mix of the two real frames' own pixels there (a shadow's edge half way across),
// it is that mix, by how far the flow says the edge has got: the ground keeps its texture exactly, only its
// light changes. See-through things move with what is behind them where that fits the last frame better
// than leaving them be (smoke as the camera moves past it). The same pass checks for
// a cut (the two frames' brightness histograms far apart, or nothing matching anywhere): then the made
// frame is the nearer real frame, never two scenes mixed. Big gaps that open behind moving things are
// filled from a pyramid of the made frame that favours the far side (the background), not smeared from
// the edge. Both frames are read with a sharp 5-tap filter, so made frames are as sharp as real ones
// (FSR 3's are a little softer). refreshesSince() counts refreshes by the clock, so a refresh the
// phone skipped doesn't hold the picture back a step (stop and go).
import {
  StorageTexture, StorageBufferAttribute, DataTexture, HalfFloatType, FloatType, UnsignedByteType, Vector2, Matrix3, Matrix4, Quaternion,
  LinearFilter, NearestFilter, Node, BlendMode, MaterialBlending, NormalBlending, NoBlending, AdditiveBlending,
} from 'three/webgpu';
import {
  Fn, instanceIndex, uint, int, float, vec2, vec3, vec4, ivec2, uniform, storage, atomicMin, atomicStore, atomicAdd,
  textureStore, texture, If, select, clamp, abs, max, min, floor, dot, mix, length, floatBitsToUint, smoothstep,
  mrt, output, velocity, diffuseColor, cameraProjectionMatrix, cameraViewMatrix, Loop, atomicLoad, atomicOr,
} from 'three/tsl';
import { halfFn, halfWanted, halfKey } from './half.js';

const EMPTY = 0xffffffff;
const LUMA = vec4(.299, .587, .114, 0);
// optical flow: how far the coarsest level searches (in its own pixels, 16 screen pixels each: +-96 screen
// pixels) and how much a flow has to beat the game's own motion on a block (mean brightness difference)
// before it is used there. A cut to a new scene: the two frames' brightness histograms this far apart
// (0..2), or the best matches this far off (mean brightness difference), counted together
const FLOW_R = 6, FLOW_GAIN = .012, CUT_HIST = .33, CUT_MISS = .05;
// a block whose brightness the game's own motion matches this closely (mean difference) is not searched at all
const FLOW_SKIP = .006;
// where the flow's picture is this close to a mix of the two real frames' own pixels (mean of r, g, b), that mix is shown
const FLOW_PICK = .06;
// Easy tiles (8 x 8 screen pixels): where the two real frames, moved by the game's own motion, agree this
// closely (brightness, 0..1: the most any pixel of the half-size brightness picture is off, and the mean) and
// nothing see-through, glowing or read from the optical flow is near, a made pixel is the two frames' mix
// with none of the checks for the hard cases (they would come to the same answer)
const EASY_MOST = .04, EASY_MEAN = .012;
// the tile sort's marks: 1 the newest frame has something see-through or glowing near, 2 the last frame did,
// 4 the optical flow is used near, 8 the two frames disagree (see EASY_*)
const NEW_MARKS = 1 | 4 | 8, OLD_MARKS = 2;

/** True for a material drawn see-through or with added light (glass, water, smoke, sparks, glows). */
export const seeThrough = m => !!m && (m.transparent === true || (m.blending !== NormalBlending && m.blending !== NoBlending));
// Picks one of two outputs by the material being drawn (worked out once per material, when it compiles).
class ByMaterial extends Node {
  constructor(solid, see, moving = null) { super('vec4'); this.solid = solid; this.see = see; this.moving = moving; }
  setup(builder) { const m = builder.material; return !seeThrough(m) ? this.solid : this.moving && m.userData?.fgMotion && m.blending === AdditiveBlending ? this.moving(m.userData.fgMotion) : this.see; }
}
const BLEND = new BlendMode(MaterialBlending);
/**
 * The scene pass's outputs for frame generation: the picture, motion (velocity) and the see-through
 * mask (reactive). Solid things write their motion; see-through things write motion with no weight
 * (alpha 0), so with their own blending the motion under them stays, and they add their coverage to
 * the mask (x). Particles that say how they move add their own motion (NDC, weighted by coverage) to
 * the mask's y and z, so the motion of the particles at a pixel is (y, z) / x. Extra outputs can be passed in.
 */
export function frameGenMRT(extra = {}) {
  const a = clamp(diffuseColor.a, 0, 1);
  const m = mrt({
    output,
    velocity: new ByMaterial(vec4(velocity, 0, 1), vec4(0)),
    reactive: new ByMaterial(vec4(0, 0, 0, 1), vec4(1, 0, 0, a), mv => vec4(1, mv.x, mv.y, a)),
    ...extra,
  });
  return m.setBlendMode('velocity', BLEND).setBlendMode('reactive', BLEND);
}

/** The camera's view and projection at the last real frame, as drawn (the app sets it): for particleMotion(). */
export const fgPrevVP = uniform(new Matrix4());
/**
 * Lets frame generation move a glowing material (added light: sparks, fire, magic) along its own
 * motion: pos is the world position (a TSL vec3) of what is drawn, step how far it moved since the last
 * real frame (a TSL vec3, in world units). gs.hd's GPU particles do this; any sprite or particle
 * material can. Ordinary see-through materials (smoke) may say it too, but stay as drawn for now.
 */
export function particleMotion(material, pos, step) {
  const c = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(pos, 1)), p = fgPrevVP.mul(vec4(pos.sub(step), 1));
  material.userData.fgMotion = c.xy.div(c.w).sub(p.xy.div(max(p.w, 1e-5)));
  material.needsUpdate = true;
  return material;
}
const NO_REACTIVE = (() => { const t = new DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; })();

/* ---------- camera poses: the turn between frames, as a rotation of the picture ---------- */
// A pose is the camera's facing (a quaternion) and its projection (fx, fy, and the centre cx, cy without
// SGSR 2's jitter). homography(a, b) maps a direction's NDC in pose a to its NDC in pose b (a 3 x 3
// matrix on (x, y, 1)): what the picture does when only the camera turns or zooms.
export const newPose = () => ({ q: new Quaternion(), fx: 1, fy: 1, cx: 0, cy: 0, persp: true });
export function poseOf(camera, jitter = null, out = newPose()) {
  camera.updateMatrixWorld(); camera.getWorldQuaternion(out.q);
  const P = camera.projectionMatrix.elements, j = jitter || [0, 0];
  out.persp = !!camera.isPerspectiveCamera && P[15] === 0;
  out.fx = P[0]; out.fy = P[5]; out.cx = P[8] + (j.x ?? j[0]); out.cy = P[9] + (j.y ?? j[1]);
  return out;
}
export function copyPose(a, out = newPose()) { out.q.copy(a.q); out.fx = a.fx; out.fy = a.fy; out.cx = a.cx; out.cy = a.cy; out.persp = a.persp; return out; }
/** The pose at t between a (0) and b (1), or past b (t > 1). */
export function lerpPose(a, b, t, out = newPose()) {
  out.q.copy(a.q).slerp(b.q, t); out.persp = a.persp && b.persp;
  out.fx = a.fx + (b.fx - a.fx) * t; out.fy = a.fy + (b.fy - a.fy) * t; out.cx = a.cx + (b.cx - a.cx) * t; out.cy = a.cy + (b.cy - a.cy) * t;
  return out;
}
const M4 = new Matrix4(), RA = new Matrix3(), RB = new Matrix3(), KM = new Matrix3();
export function homography(a, b, out = new Matrix3()) {
  if (!a.persp || !b.persp) return out.identity();
  RA.setFromMatrix4(M4.makeRotationFromQuaternion(a.q)); RB.setFromMatrix4(M4.makeRotationFromQuaternion(b.q)).transpose();
  // NDC (x, y) in a -> a camera-space direction ((x + cx) / fx, (y + cy) / fy, -1) -> world -> b's camera -> b's NDC
  out.set(1 / a.fx, 0, a.cx / a.fx, 0, 1 / a.fy, a.cy / a.fy, 0, 0, -1);
  out.premultiply(RA).premultiply(RB);
  return out.premultiply(KM.set(b.fx, 0, b.cx, 0, b.fy, b.cy, 0, 0, -1));
}
// a uv (y down) moved by a homography uniform (TSL)
const ndcOf = u => vec2(u.x.mul(2).sub(1), float(1).sub(u.y.mul(2)));
const warpUV = (u, Hm) => { const h = Hm.mul(vec3(ndcOf(u), 1)), z = max(h.z, 1e-4); return vec2(h.x.div(z).mul(.5).add(.5), float(.5).sub(h.y.div(z).mul(.5))); };
export { warpUV };

/**
 * A picture read sharp between its pixels: a Catmull-Rom curve through the 4 x 4 pixels round uv, in five
 * linear samples (the corners left out), on the picture's own pixels (its size, read from it). A plain
 * linear sample softens whatever it moves by a fraction of a pixel; this keeps it as sharp as it was drawn,
 * and on a pixel's centre gives that pixel back exactly. Never below 0. half: the curve's weights and the
 * sum in half precision where the chip has it (half.js; the places it reads stay full: they are on the
 * picture's pixels), as SGSR 2 and frame generation want.
 */
const SHARP = halfFn('gsSharpAt', `(T: texture_2d<f32>, S: sampler, uv: vec2<f32>) -> vec4<f32> {
  let ts = vec2<f32>(textureDimensions(T, 0)); let P = uv * ts; let c = floor(P - 0.5) + 0.5;
  let f = hf2(P - c); let f2 = f * f; let f3 = f2 * f;
  let w0 = f3 * hf(-0.5) + f2 - f * hf(0.5); let w1 = f3 * hf(1.5) - f2 * hf(2.5) + hf(1.0);
  let w2 = f3 * hf(-1.5) + f2 * hf(2.0) + f * hf(0.5); let w3 = f3 * hf(0.5) - f2 * hf(0.5);
  let w12 = w1 + w2; let t12 = (c + vec2<f32>(w2 / w12)) / ts; let t0 = (c - 1.0) / ts; let t3 = (c + 2.0) / ts;
  let a = w12.x * w0.y; let b = w0.x * w12.y; let m = w12.x * w12.y; let d = w3.x * w12.y; let e = w12.x * w3.y;
  let sum = hf4(textureSampleLevel(T, S, vec2<f32>(t12.x, t0.y), 0.0)) * a + hf4(textureSampleLevel(T, S, vec2<f32>(t0.x, t12.y), 0.0)) * b
    + hf4(textureSampleLevel(T, S, t12, 0.0)) * m + hf4(textureSampleLevel(T, S, vec2<f32>(t3.x, t12.y), 0.0)) * d + hf4(textureSampleLevel(T, S, vec2<f32>(t12.x, t3.y), 0.0)) * e;
  return max(vec4<f32>(sum / (a + b + m + d + e)), vec4<f32>(0.0));
}`);
export const sharpAt = (T, uv, half = false) => SHARP({ T, S: T, uv }, half);

/**
 * One view's frame generator. The pictures it is given are three.js textures: color is the finished
 * frame at the screen's size (after SGSR 2), velocity is three's velocity MRT (NDC now minus NDC last
 * frame, at the render size) and depth is the scene's depth (0 near, 1 far, at the render size).
 */
export class FrameGen {
  constructor(r, { tolerance = .04, flow = true, fill = true, sharp = true, quick = true } = {}) {
    this.r = r; this.key = ''; this.frames = 0; this.ready = false; this.flowFor = -1;
    this.U = {
      rs: uniform(new Vector2(1, 1)), os: uniform(new Vector2(1, 1)), t: uniform(.5), jd: uniform(new Vector2()),
      tol: uniform(tolerance), interp: uniform(1), near: uniform(.1), far: uniform(1000), up: uniform(0),
      // optical flow and the gap-filling pyramid on (1) or off (0): switches, so trying without needs no rebuild
      flowOn: uniform(flow ? 1 : 0), fillOn: uniform(fill ? 1 : 0), sharp: uniform(sharp ? 1 : 0),
      // the quick way for easy tiles (see the tile sort below): on (1) or off (0); it needs the optical flow's pictures
      quick: uniform(quick ? 1 : 0), go: uniform(0),   // go: the tiles were sorted for this pair (make() sets it)
      // tint (1): the pixels the optical flow moved are tinted magenta (tests and the frame lab: where it is used)
      tint: uniform(0),
      // the camera's turn: newest -> last frame, last -> the one before, newest -> the moment made; 1 once three frames are in
      Hb: uniform(new Matrix3()), Hb2: uniform(new Matrix3()), Ht: uniform(new Matrix3()), hist: uniform(0),
    };
    this.poses = [newPose(), newPose(), newPose()];   // newest, last, the one before
    this.stats = { real: 0, made: 0, ms: 0 };
  }

  /* (re)makes the buffers and the compute passes for a size */
  build(rw, rh, ow, oh, handed = false, eight = false) {
    const key = `${rw}x${rh}>${ow}x${oh}${handed ? ' handed' : ''}${eight ? ' 8' : ''} ${halfKey()}`;
    if (key === this.key) return;
    const half = halfWanted();   // (half.js: the sharp reads' maths in half where the chip has it)
    this.dispose(); this.key = key; this.frames = 0; this.ready = false;
    const n = rw * rh, on = ow * oh, U = this.U, upscaled = ow * oh > rw * rh * 1.1;
    const st = (w, h, type = HalfFloatType, filter = NearestFilter) => { const s = new StorageTexture(w, h); s.type = type; s.minFilter = s.magFilter = filter; return s; };
    // last real frame's colour (screen size), and at the render size its depth (x), see-through mask (y)
    // and motion back to the frame before it (zw: for the curve through three frames), kept at keep().
    // handed: the caller still has the last frame's picture and passes it to real() (o.prevColor), so the
    // colour isn't copied and has no picture of its own here (a screen-sized one, and a pass over it each frame)
    // eight: the pictures are finished screen colours (0..1, as the screen's own 8 bits a channel take them),
    // so the made frame and its unfilled copy are kept in 8 bits too: half the bytes of the 16-bit ones, at
    // the screen's size, written and read for every made frame. (The gap pyramid stays 16-bit: it adds up
    // colours times small weights. HDR pictures go past 1, so they keep 16 bits throughout.)
    const colT = eight ? UnsignedByteType : HalfFloatType;
    this.prevColor = handed ? null : st(ow, oh, colT, LinearFilter);
    const blank = this.prevColor || (this.blank = st(1, 1, HalfFloatType, LinearFilter));
    this.prevDepth = st(rw, rh, FloatType);
    // mid-frame motion: one depth key per render pixel (atomic min), then the motion that won it
    this.keysAttr = new StorageBufferAttribute(new Uint32Array(n), 1);
    this.midMotion = st(rw, rh, FloatType);   // xy: displacement (uv) from frame N back to N-1, z: depth, w: 1 found (2: a moving particle); only where a key was set (else a hole)
    this.midBend = st(rw, rh);        // xy: how far the camera's turn and the curve put it off the straight line (uv)
    this.filled = st(rw, rh, FloatType);      // the holes' motion, filled from the background round them (written only at holes)
    this.filledBend = st(rw, rh);
    this.raw = st(ow, oh, colT, LinearFilter);   // the made frame before its gaps are filled (alpha: 0 a gap, else how far the surface is)
    this.output = st(ow, oh, colT, LinearFilter);
    // optical flow (the second motion, read from the pictures: FSR 3's optical flow field), once per real
    // frame: both frames' brightness at 1/2 .. 1/16 of the screen (x the newest, y the last), and the flow
    // in blocks of 64, 32, 16 and 8 screen pixels (xy: uv from the newest back to the last; z: how well it
    // matches; w: how much better it matches than the game's own motion there, at the finest level)
    const sz = k => [Math.max(1, Math.ceil(ow / 2 ** k)), Math.max(1, Math.ceil(oh / 2 ** k))];
    this.lum = [1, 2, 3, 4].map(k => st(...sz(k), HalfFloatType, LinearFilter));
    this.flow = [3, 4, 5, 6].map(k => st(...sz(k)));
    // the gap-filling pyramid (FSR 3's inpainting pyramid): the made frame at 1/2 .. 1/32, each pixel the
    // average of the surfaces found round it, the far ones (the background a gap uncovers) counting most
    this.pyr = [1, 2, 3, 4, 5].map(k => st(...sz(k), HalfFloatType, LinearFilter));
    // (their sizes are uniforms too, kept across builds)
    const LS = this.LS ||= [1, 2, 3, 4].map(() => uniform(new Vector2())), FS = this.FS ||= [3, 4, 5, 6].map(() => uniform(new Vector2())), PS = this.PS ||= [1, 2, 3, 4, 5].map(() => uniform(new Vector2()));
    [1, 2, 3, 4].forEach((k, i) => LS[i].value.set(...sz(k))); [3, 4, 5, 6].forEach((k, i) => FS[i].value.set(...sz(k))); [1, 2, 3, 4, 5].forEach((k, i) => PS[i].value.set(...sz(k)));
    // the cut check: [0] the coarsest flow's misses added up, [1] its blocks, [2..33] and [34..65] the two
    // frames' brightness histograms (32 bins, at 1/16 size), [66] 1 when it's a cut, [67] [68] how far the
    // histograms and the matches were off (x 4096, for tests), [69] how many tiles the tile sort found easy
    this.cutAttr = new StorageBufferAttribute(new Uint32Array(72), 1);
    // the tile sort (see EASY_*), once per pair of real frames: each 8 x 8 tile of the screen's picture (the
    // optical flow's finest blocks), marked by the see-through and glowing things on it, then sorted (0: easy)
    const [TX, TY] = sz(3), nt = TX * TY;
    this.marksAttr = new StorageBufferAttribute(new Uint32Array(nt), 1);
    this.tilesAttr = new StorageBufferAttribute(new Uint32Array(nt), 1);
    this.tileCount = nt;
    const keys = storage(this.keysAttr, 'uint', n).toAtomic(), keysR = storage(this.keysAttr, 'uint', n);
    // the inputs change every frame (SGSR 2 takes turns between two pictures): nodes whose value real() sets
    const col = this.colN = texture(blank), vel = this.velN = texture(blank), dep = this.depN = texture(this.prevDepth);
    const rea = this.reaN = texture(NO_REACTIVE);
    const pcol = this.pcolN = texture(blank), pdep = texture(this.prevDepth), mm = texture(this.midMotion), mb = texture(this.midBend);
    const fm = texture(this.filled), fb = texture(this.filledBend);
    // (the sizes are uniforms, never numbers written into the shaders: a new size, which the resolution steps
    // make mid-round, then reuses the shaders already built instead of stalling to build new ones)
    U.up.value = upscaled ? 1 : 0;
    const W = int(U.rs.x), H = int(U.rs.y), hi = ivec2(W.sub(1), H.sub(1));
    const xy = i => ivec2(int(i).mod(W), int(i).div(W));
    // velocity (NDC, y up) as a uv displacement from this frame back to the last (uv y down), without the
    // change in SGSR 2's jitter (else still pictures would shimmer by a pixel)
    const back = v => vec2(v.x.sub(U.jd.x).mul(-.5), v.y.sub(U.jd.y).mul(.5));
    const uvOf = p => vec2(p).add(.5).div(U.rs);
    const pixOf = u => clamp(ivec2(floor(u.mul(U.rs))), ivec2(0, 0), hi);
    const inside = p => p.x.greaterThanEqual(0).and(p.y.greaterThanEqual(0)).and(p.x.lessThan(W)).and(p.y.lessThan(H));
    const in01 = u => u.x.greaterThanEqual(0).and(u.y.greaterThanEqual(0)).and(u.x.lessThanEqual(1)).and(u.y.lessThanEqual(1));
    // compared as distance from the camera (the depth picture bunches everything far away near 1)
    const lin = v => U.near.mul(U.far).div(U.far.sub(v.mul(U.far.sub(U.near))));
    // particles' own motion at a pixel (NDC) and how much of it is them
    const partMove = r => r.yz.div(max(r.x, 1e-4));
    const movingOf = (r, size) => smoothstep(.25, 1, length(partMove(r).mul(.5).mul(size))).mul(smoothstep(.002, .01, r.x));
    // the last frame kept its see-through cover in y, less than 0 where a moving particle was: nothing there
    const clear = (y, most) => y.greaterThanEqual(0).and(y.lessThan(most));
    // A moving particle's pixel is moved along its own motion only where the last frame shows a moving
    // particle where it says it came from, about as bright: one particle, followed. Where particles cross
    // (their motions mixed at a pixel) or flare up, it stays as drawn, like any see-through thing.
    const liftAt = u => {
      const lift = float(0).toVar(), uc = clamp(u, 0, 1), r = rea.sample(uc).level(0);
      If(movingOf(r, U.os).greaterThan(.5), () => {
        const uF = u.add(back(partMove(r)));
        const same = in01(uF).and(pdep.load(pixOf(uF)).y.lessThan(0)).and(abs(dot(col.sample(uc).level(0).sub(pcol.sample(clamp(uF, 0, 1)).level(0)), LUMA)).lessThan(.05));
        lift.assign(select(same, float(1), float(0)));
      });
      return lift;
    };

    // Where a pixel of the newest frame is at time t (s = t - 1): the camera's exact turn, then the rest
    // along a curve through the last three frames. Returns its straight-line motion d (uv, newest back to
    // last), the bend e off that line, its depth key z and whether a moving particle owns it.
    const motionAt = p => {
      const u0 = uvOf(p), z0 = dep.load(p).x, r4 = rea.load(p);
      const dv = back(vel.load(p).xy), dp = back(partMove(r4));
      const part = liftAt(u0).greaterThan(.5);
      // the camera's turn from the newest frame back to the last, and what's left (moves, and the camera's slide)
      const dRot = warpUV(u0, U.Hb).sub(u0), rest = dv.sub(dRot);
      // the same pixel's motion a frame earlier (kept at keep()), less that frame's turn
      const uP0 = u0.add(dv), pd = pdep.load(pixOf(uP0)), L = lin(z0);
      const okH = U.hist.greaterThan(.5).and(in01(uP0)).and(abs(lin(pd.x).sub(L)).lessThan(L.mul(.15).add(.05)));
      const rest2 = pd.zw.sub(warpUV(uP0, U.Hb2).sub(uP0));
      const lr = length(rest), dir = rest.div(max(lr, 1e-7));
      // the bend: sideways only (a speed-up or slow-down along the path would overshoot), at most half the step
      const b = rest2.sub(rest).mul(.5), bs = b.sub(dir.mul(dot(b, dir))), lb = length(bs);
      const bend = select(okH.and(lr.greaterThan(1e-6)), bs.mul(min(float(1), lr.mul(.5).div(max(lb, 1e-9)))), vec2(0));
      // past the newest frame: slowing down keeps slowing down (never speeds up)
      const s = U.t.sub(1), slow = select(okH.and(s.greaterThan(0)), clamp(lr.div(max(length(rest2), 1e-7)), 0, 1), float(1));
      const at = warpUV(u0, U.Ht).sub(u0).add(rest.mul(s.negate()).mul(slow)).add(bend.mul(s.add(s.mul(s))));
      const e = select(part, vec2(0), at.sub(dv.mul(float(1).sub(U.t))));
      return { d: select(part, dp, dv), e, z: select(part, float(0), z0), part };
    };

    // 1 clear the keys (the motion needs no clearing: a pixel no key reached is a gap, whatever its motion says)
    this.cClear = Fn(() => {
      atomicStore(keys.element(instanceIndex), uint(EMPTY));
    })().compute(n, [64]);

    // 2 splat: each pixel of the newest frame goes to where it is at time t (0 = last frame, 1 = newest),
    // the nearest winning (depth's bits order like the number, as depth is never negative; moving particles count as nearest)
    const target = (p, m) => ivec2(floor(uvOf(p).add(m.d.mul(float(1).sub(U.t))).add(m.e).mul(U.rs)));
    this.cSplat = Fn(() => {
      const p = xy(instanceIndex), m = motionAt(p), q = target(p, m);
      If(inside(q), () => { atomicMin(keys.element(q.y.mul(W).add(q.x)), floatBitsToUint(m.z)); });
    })().compute(n, [64]);

    // 3 resolve: the winners write their motion; untouched pixels stay holes
    this.cResolve = Fn(() => {
      const p = xy(instanceIndex), m = motionAt(p), q = target(p, m);
      If(inside(q), () => {
        If(keysR.element(q.y.mul(W).add(q.x)).equal(floatBitsToUint(m.z)), () => {
          textureStore(this.midMotion, q, vec4(m.d, m.z, select(m.part, float(2), float(1))));
          textureStore(this.midBend, q, vec4(m.e, 0, 0));
        });
      });
    })().compute(n, [64]);

    // 4 fill holes: a hole is something uncovered between the two frames, so it takes the motion of the
    // FARTHEST found pixel round it (the background), looking 1, 2 then 4 pixels out. Only the holes are
    // written (into filled): elsewhere the splat's own motion is read where it is (motionOf below)
    const found = c => keysR.element(c.y.mul(W).add(c.x)).notEqual(uint(EMPTY));
    this.cFill = Fn(() => {
      const p = xy(instanceIndex);
      If(inside(p).and(found(p).not()), () => {
        const best = vec4(0, 0, -1, 0).toVar(), be = vec2(0).toVar();
        for (const s of [1, 2, 4]) for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
          const at = clamp(p.add(ivec2(ox * s, oy * s)), ivec2(0, 0), hi), c = mm.load(at);
          // (not a moving particle's: what a particle uncovers moves with the background)
          If(found(at).and(c.w.lessThan(1.5)).and(c.z.greaterThan(best.z)), () => { best.assign(vec4(c.xyz, .5)); be.assign(mb.load(at).xy); });
        }
        // nothing found round it either (a big uncovered area): the newest frame's own motion there
        If(best.z.lessThan(0), () => { best.assign(vec4(back(vel.load(p).xy), dep.load(p).x, .25)); be.assign(vec2(0)); });
        textureStore(this.filled, p, best); textureStore(this.filledBend, p, vec4(be, 0, 0));
      });
    })().compute(n, [64]);
    // the motion at a render pixel at the moment made (for compose): the splat's winner there, or the fill's for a hole
    // (xyzw as midMotion: w 1 found, 2 a moving particle, .5 or .25 a hole filled from round it or from the newest frame)
    const motionOf = c => { const m = vec4(0).toVar(); If(found(c), () => { m.assign(mm.load(c)); }).Else(() => { m.assign(fm.load(c)); }); return m; };
    const bendOf = c => { const e = vec2(0).toVar(); If(found(c), () => { e.assign(mb.load(c).xy); }).Else(() => { e.assign(fb.load(c).xy); }); return e; };

    // optical flow, once per real frame (FSR 3 reads a second motion from the pictures, for what the game's
    // motion doesn't describe: shadows, reflections, scrolling textures, glows). Block matching, coarse to
    // fine: each block of the newest frame looks for the place in the last frame whose brightness matches
    // best, trying the game's own motion there first (so where both fit, the game's wins), no motion, the
    // coarser level's answers round it, then a pixel either way. The coarsest also searches a wide square.
    const PIX = [2, 4, 8, 16];   // screen pixels per pixel of each brightness level
    const lumT = this.lum.map(t => texture(t)), flowT = this.flow.map(t => texture(t)), cut = storage(this.cutAttr, 'uint', 72).toAtomic(), cutR = storage(this.cutAttr, 'uint', 72);
    this.cLum = this.lum.map((t, k) => Fn(() => {
      const s = LS[k], p = ivec2(int(instanceIndex).mod(int(s.x)), int(instanceIndex).div(int(s.x)));
      // each pixel the average of the 2 x 2 below it (a linear sample at their shared corner)
      const u = vec2(p).mul(2).add(1).div(k ? LS[k - 1] : U.os);
      const v = k ? lumT[k - 1].sample(u).level(0) : vec4(dot(col.sample(u).level(0), LUMA), dot(pcol.sample(u).level(0), LUMA), 0, 0);
      textureStore(t, p, v);
      // the smallest level also fills the two frames' brightness histograms (FidelityFX's scene change check)
      if (k === 3) { atomicAdd(cut.element(int(clamp(v.x, 0, .999).mul(32)).add(2)), uint(1)); atomicAdd(cut.element(int(clamp(v.y, 0, .999).mul(32)).add(34)), uint(1)); }
    })().compute(sz(k + 1)[0] * sz(k + 1)[1], [64]));
    // how badly a block (4 x 4 brightness pixels at level k, block g) matches the last frame moved by d (uv): the mean difference
    const miss = (k, g, d) => {
      const L = lumT[k], s = LS[k], hiL = ivec2(int(s.x).sub(1), int(s.y).sub(1));
      let sum = float(0);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const p = clamp(g.mul(4).add(ivec2(x, y)), ivec2(0, 0), hiL);
        sum = sum.add(abs(L.load(p).x.sub(L.sample(vec2(p).add(.5).div(s).add(d)).level(0).y)));
      }
      return sum.div(16);
    };
    // the game's motion at the middle of a block of b screen pixels (uv, newest back to last)
    const gameAt = (g, b) => back(vel.load(pixOf(vec2(g).mul(b).add(b / 2).div(U.os))).xy);
    // how badly the block matches with each of its pixels moved by the game's own motion there (what the
    // made frame does without the flow): the flow is only worth using where it beats this
    const missGame = g => {
      const L = lumT[0], s = LS[0], hiL = ivec2(int(s.x).sub(1), int(s.y).sub(1));
      let sum = float(0);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const p = clamp(g.mul(4).add(ivec2(x, y)), ivec2(0, 0), hiL), u = vec2(p).add(.5).div(s);
        sum = sum.add(abs(L.load(p).x.sub(L.sample(u.add(back(vel.load(pixOf(u)).xy))).level(0).y)));
      }
      return sum.div(16);
    };
    this.cCutClear = Fn(() => { atomicStore(cut.element(instanceIndex), uint(0)); })().compute(66, [64]);
    // a cut to a new scene: the two frames' brightness spread very different, or nothing matching anywhere
    this.cCutDecide = Fn(() => {
      const dh = float(0).toVar(), tot = float(0).toVar();
      // (read through the atomic view: one buffer can't be bound twice in a pass that writes it)
      const at = i => float(atomicLoad(cut.element(i)));
      Loop(32, ({ i }) => { const a = at(int(i).add(2)), b = at(int(i).add(34)); dh.addAssign(abs(a.sub(b))); tot.addAssign(a); });
      const hd = dh.div(max(tot, 1)), md = at(0).div(max(at(1), 1)).div(4096);
      // (either one far off, or both quite far off: in the tests a cut scores about twice the worst fast pan on each)
      atomicStore(cut.element(66), select(hd.div(CUT_HIST).add(md.div(CUT_MISS)).greaterThan(2), uint(1), uint(0)));
      atomicStore(cut.element(67), uint(hd.mul(4096))); atomicStore(cut.element(68), uint(md.mul(4096)));
    })().compute(1, [1]);
    this.cFlow = [3, 2, 1, 0].map(k => Fn(() => {
      const s = FS[k], g = ivec2(int(instanceIndex).mod(int(s.x)), int(instanceIndex).div(int(s.x))), px = LS[k];
      const gm = gameAt(g, PIX[k] * 4), gc = miss(k, g, gm), best = float(gc).toVar(), bd = vec2(gm).toVar(), gain = float(0).toVar();
      // a try replaces the best only if clearly better (flat areas match anything: they keep the game's motion)
      const tryAt = d => { const c = miss(k, g, d); If(c.lessThan(best.mul(.9).sub(.001)), () => { best.assign(c); bd.assign(d); }); };
      // a block the game's own motion already matches (most of a picture, most of the time: everything the game
      // says how it moves) has nothing to look for: no try could beat it clearly. Only the rest is searched, so the
      // flow costs little where it isn't needed (FLOW_SKIP)
      If(gc.greaterThanEqual(FLOW_SKIP), () => {
        if (k === 3) {
          Loop({ start: int(-FLOW_R), end: int(FLOW_R), condition: '<=', name: 'fy' }, ({ fy }) => {
            Loop({ start: int(-FLOW_R), end: int(FLOW_R), condition: '<=', name: 'fx' }, ({ fx }) => { tryAt(vec2(float(fx), float(fy)).div(px)); });
          });
        } else {
          tryAt(vec2(0));
          const up = FS[k + 1], hiU = ivec2(int(up.x).sub(1), int(up.y).sub(1));
          // (the coarser block over this one and the two beside it that are nearest: this block is a quarter of it)
          const pg = g.div(2), side = g.sub(pg.mul(2)).mul(2).sub(1);
          for (const o of [ivec2(0, 0), ivec2(side.x, 0), ivec2(0, side.y)]) tryAt(flowT[k + 1].load(clamp(pg.add(o), ivec2(0, 0), hiU)).xy);
        }
        // then round the best: blocks of 16 screen pixels two of their pixels either way (a small thing that moves unlike
        // what is round it, such as a shadow's edge, a reflection or a ball on a screen, is lost in the coarser blocks,
        // which follow the ground: here it is found again, up to 8 screen pixels off), the rest one pixel either way
        const c0 = vec2(bd).toVar(), R = k === 1 ? 2 : 1;
        for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) if ((ox || oy) && (k === 3 || R > 1 || !ox || !oy)) tryAt(c0.add(vec2(ox, oy).div(px)));
        // and the finest to half its pixel (a screen pixel: its brightness is read between pixels), so the two frames
        // a made pixel is mixed from line up to a pixel, edges and all
        if (k === 0) { const c1 = vec2(bd).toVar(); for (const [ox, oy] of [[-.5, 0], [.5, 0], [0, -.5], [0, .5]]) tryAt(c1.add(vec2(ox, oy).div(px))); }
        // finest: how much better than the game's motion pixel by pixel (0 where they're the same move, within a pixel)
        // (a clear win only: the flow's match at most 40% as far off as the game's, so a texture that repeats
        // or shimmers in the distance, which matches many ways a little better, keeps the game's motion)
        if (k === 0) { const mg = missGame(g); If(length(bd.sub(gm).mul(U.os)).greaterThan(.75).and(best.lessThan(mg.mul(.4))), () => { gain.assign(mg.sub(best)); }); }
      });
      // the coarsest level adds up how badly the whole screen matches: a cut to a new scene matches nowhere
      if (k === 3) { atomicAdd(cut.element(0), uint(min(best, 1).mul(4096))); atomicAdd(cut.element(1), uint(1)); }
      textureStore(this.flow[k], g, vec4(bd, best, k ? gc : gain));
    })().compute(sz(k + 3)[0] * sz(k + 3)[1], [64]));
    const isCut = () => cutR.element(66).greaterThan(uint(0));

    // 4b the tile sort, once per pair of real frames (after the optical flow, which it reads): which 8 x 8 tiles of
    // the screen's picture are easy (see EASY_*), so the made frames there take the quick way in compose (5).
    // First the marks: every render pixel with something see-through or glowing on it (the newest frame's mask,
    // the last frame's cover) marks the tiles it and the pixels either side of it fall in (a linear read of it
    // reaches that far; at most three tiles each way, for a picture drawn up to eight times smaller than the screen)
    const TS = FS[0], TW = int(TS.x), hiT = ivec2(TW.sub(1), int(TS.y).sub(1));
    const marks = storage(this.marksAttr, 'uint', nt).toAtomic(), tiles = storage(this.tilesAttr, 'uint', nt);
    const tileOf = sp => clamp(ivec2(floor(sp.div(8))), ivec2(0, 0), hiT);   // the tile a point (in screen pixels) is in
    const tileIx = g => g.y.mul(TW).add(g.x);
    const mark = (p, bit) => {
      const a = tileOf(vec2(p).sub(1).mul(U.os).div(U.rs)), b = tileOf(vec2(p).add(2).mul(U.os).div(U.rs));
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) atomicOr(marks.element(tileIx(min(a.add(ivec2(x, y)), b))), uint(bit));
    };
    this.cMarkClear = Fn(() => {
      atomicStore(marks.element(instanceIndex), uint(0));
      If(instanceIndex.equal(uint(0)), () => { atomicStore(cut.element(69), uint(0)); });
    })().compute(nt, [64]);
    this.cMark = Fn(() => {
      const p = xy(instanceIndex);
      If(inside(p), () => {
        If(rea.load(p).x.greaterThan(.002), () => { mark(p, 1); });
        If(abs(pdep.load(p).y).greaterThan(.002), () => { mark(p, 2); });
      });
    })().compute(n, [64]);
    // then each tile: 0 (easy) or what makes it hard. The optical flow is read in blocks of 8 screen pixels, the four
    // round a pixel, so any of the nine round the tile that is used counts; and the newest frame is held against the
    // last one moved by the game's own motion, on the tile's 4 x 4 brightness pixels (a made pixel mixes such a pair)
    this.cTiles = Fn(() => {
      const i = int(instanceIndex), g = ivec2(i.mod(TW), i.div(TW));
      If(g.y.lessThan(int(TS.y)), () => {
        let fl = float(0);
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) fl = max(fl, flowT[0].load(clamp(g.add(ivec2(x, y)), ivec2(0, 0), hiT)).w);
        const L = lumT[0], s = LS[0], hiL = ivec2(int(s.x).sub(1), int(s.y).sub(1));
        let most = float(0), sum = float(0);
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          const p = clamp(g.mul(4).add(ivec2(x, y)), ivec2(0, 0), hiL), u = vec2(p).add(.5).div(s);
          const d = abs(L.load(p).x.sub(L.sample(u.add(back(vel.load(pixOf(u)).xy))).level(0).y));
          most = max(most, d); sum = sum.add(d);
        }
        const hard = atomicLoad(marks.element(i)).bitOr(select(fl.greaterThan(FLOW_GAIN), uint(4), uint(0)))
          .bitOr(select(most.greaterThan(EASY_MOST).or(sum.div(16).greaterThan(EASY_MEAN)), uint(8), uint(0)));
        tiles.element(i).assign(hard);
        If(hard.equal(uint(0)), () => { atomicAdd(cut.element(69), uint(1)); });
      });
    })().compute(nt, [64]);

    // 5 compose, at the screen's size: the newest frame from where each pixel was at t = 1 and the last
    // frame from where it was at t = 0, each kept only if it sees the same surface (its depth isn't in
    // front of it), blended by time. Ahead of the newest frame (t > 1) there is only the newest to take from.
    // An easy tile (the tile sort above) takes the quick way: the two frames' mix (or the newest, ahead) with
    // none of the checks for the hard cases, which there come to the same answer. Each workgroup is one
    // tile, so a tile goes one way or the other as a whole.
    const OW = int(U.os.x), OH = int(U.os.y);
    const differ3 = (a, b) => dot(abs(a.sub(b)).xyz, vec3(1 / 3));   // how far two colours are apart (the mean of r, g and b)
    const fromN = (u, m, e) => u.sub(m.xy.mul(float(1).sub(U.t))).sub(e), fromP = (u, m, e) => u.add(m.xy.mul(U.t)).sub(e);
    this.cCompose = Fn(() => {
      const i = int(instanceIndex), tl = i.shiftRight(6), lid = i.bitAnd(63);
      const q = ivec2(tl.mod(TW).mul(8).add(lid.bitAnd(7)), tl.div(TW).mul(8).add(lid.shiftRight(3))), u = vec2(q).add(.5).div(U.os);
      // (sampled sharp, as a Catmull-Rom curve through the 4 x 4 pixels round the spot, in five linear
      // samples: a plain linear sample between pixels softens the picture, so every made frame would look
      // a little blurrier than the real ones round it, which shows as a shimmer)
      // (only on a picture at the screen's size, as the app gives it: a smaller one is being magnified anyway)
      const sharpOn = U.sharp.greaterThan(.5).and(length(vec2(col.size(int(0))).sub(U.os)).lessThan(.5));
      const pick = (T, v) => { const c = vec4(0).toVar(); If(sharpOn, () => { c.assign(sharpAt(T, clamp(v, 0, 1), half)); }).Else(() => { c.assign(T.sample(clamp(v, 0, 1)).level(0)); }); return c; };
      If(q.x.lessThan(OW).and(q.y.lessThan(OH)), () => {
        const pc = pixOf(u), m0 = motionOf(pc), e0 = bendOf(pc);   // nearest: motion never blends across an edge
        const f = u.mul(U.rs).sub(.5), b0 = ivec2(floor(f)), C = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => clamp(b0.add(ivec2(x, y)), ivec2(0, 0), hi));
        // the quick way: an easy tile, this pixel's motion found by the splat (not a gap filled from round it, not a
        // moving particle), the same within a pixel at the four render pixels round it, both frames' spots on the
        // screen and in tiles marked easy for that frame (the newest's: no see-through or glowing thing, no flow,
        // the frames agreeing; the last's: no see-through thing), and no cut
        const spread = float(0).toVar();
        If(U.up.greaterThan(.5), () => { const m1 = C.map(motionOf); spread.assign(m1.slice(1).reduce((s, c) => max(s, length(c.xy.sub(m1[0].xy).mul(U.os))), float(0))); });
        const uN0 = fromN(u, m0, e0), uP0 = fromP(u, m0, e0), tileAt = v => tiles.element(tileIx(tileOf(v.mul(U.os))));
        const interp = U.interp.greaterThan(.5);
        const quick = U.go.greaterThan(.5).and(m0.w.greaterThan(.9)).and(m0.w.lessThan(1.5)).and(spread.lessThanEqual(.75)).and(in01(uN0))
          .and(interp.not().or(in01(uP0))).and(tileAt(u).equal(uint(0))).and(tileAt(uN0).bitAnd(uint(NEW_MARKS)).equal(uint(0)))
          .and(interp.not().or(tileAt(uP0).bitAnd(uint(OLD_MARKS)).equal(uint(0)))).and(isCut().not());
        If(quick, () => {
          const cN = pick(col, uN0), fin = vec4(cN).toVar();
          If(interp, () => { fin.assign(mix(pick(pcol, uP0), cN, clamp(U.t, 0, 1))); });
          textureStore(this.raw, q, vec4(fin.xyz, clamp(lin(m0.z).div(40), .02, 1)));
        }).Else(() => {
          const m = vec4(m0).toVar(), e = vec2(e0).toVar();
          If(U.up.greaterThan(.5), () => {
            // drawn smaller than the screen, the motion is in blocks of several screen pixels: at a moving edge,
            // of the four motions round this pixel take the one whose two frames agree (the same surface at both moments)
            const ms = C.map(motionOf), spread = C.slice(1).reduce((s, c, k) => max(s, length(ms[k + 1].xy.sub(ms[0].xy).mul(U.os))), float(0));
            If(spread.greaterThan(.75).and(U.interp.greaterThan(.5)), () => {
              const best = float(1e9).toVar();
              C.forEach((c, k) => {
                const ek = bendOf(c), d = abs(dot(col.sample(clamp(fromN(u, ms[k], ek), 0, 1)).level(0).sub(pcol.sample(clamp(fromP(u, ms[k], ek), 0, 1)).level(0)), LUMA));
                const cost = d.add(select(ms[k].w.greaterThan(.9), float(0), float(.05)));
                If(cost.lessThan(best), () => { best.assign(cost); m.assign(ms[k]); e.assign(ek); });
              });
            });
          });
          const d = m.xy, z = m.z, isPart = m.w.greaterThan(1.5);
          const uN = fromN(u, m, e), uP = fromP(u, m, e);
          const cN = pick(col, uN), cP = pick(pcol, uP);
          const L = lin(z), tol = L.mul(U.tol);
          const inN = in01(uN), inP = in01(uP).and(U.interp.greaterThan(.5));
          // the newest frame's pixel there is a moving particle, but this one is the background behind it: not from there
          const rN = rea.sample(clamp(uN, 0, 1)).level(0), liftN = liftAt(uN), partN = liftN.greaterThan(.5);
          const okN = inN.and(lin(dep.load(pixOf(uN)).x).greaterThan(L.sub(tol))).and(isPart.or(partN.not()));
          const pP = pdep.load(pixOf(uP));
          // the last frame's see-through things were where they were, not where the background went: skip it there
          const okP = inP.and(lin(pP.x).greaterThan(L.sub(tol))).and(clear(pP.y, .25));
          // unmarked see-through things (a game's own blending) would show twice: where the two frames disagree
          // a lot about a pixel that is barely moving, keep the newest
          const still = length(d.mul(U.os)).lessThan(1.5), differ = abs(dot(cN.sub(cP), LUMA)).greaterThan(.2);
          // neither sees the same surface: the newest frame, unless that pixel has gone off the screen's edge
          // and the last frame still has it (else the edge row would be stretched into streaks)
          const lost = select(inN.not().and(inP), float(0), float(1));
          const wN = select(okN, select(okP, select(still.and(differ), float(1), U.t), float(1)), select(okP, float(0), lost));
          const made = mix(cP, cN, clamp(wN, 0, 1)).toVar(), flowed = float(0).toVar();
          // a gap: neither frame saw the surface that is here at t (it was hidden in both), though the newest
          // frame has a picture there (step 8 fills it from the pyramid)
          const gap = float(select(inN.and(okN.not()).and(okP.not()).and(isPart.not()), float(1), float(0))).toVar();
          // a moving particle followed from the last frame: its light then and now, by time
          If(isPart, () => { made.assign(select(in01(uP).and(U.interp.greaterThan(.5)), mix(cP, cN, U.t), cN)); });
          // optical flow: where a block of the picture moved in a way the game's motion doesn't say (a shadow
          // crossing still ground, a scrolling texture, a reflection, a glow, a picture on a screen), the move
          // whose two frames agree best wins
          If(U.flowOn.greaterThan(.5).and(isPart.not()).and(okN), () => {
            const fs = FS[0], fq = u.mul(fs).sub(.5), f0 = ivec2(floor(fq)), hiF = ivec2(int(fs.x).sub(1), int(fs.y).sub(1));
            const C = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => flowT[0].load(clamp(f0.add(ivec2(x, y)), ivec2(0, 0), hiF)));
            const most = C.reduce((s, c) => max(s, c.w), float(0));
            const same = z => abs(z.sub(L)).lessThan(L.mul(.1).add(.05));
            If(most.greaterThan(FLOW_GAIN), () => {
              // between two frames: against the game's motion, each flow round here (FSR 3 weighs its two motions the same way)
              // (only where the game's motion clearly fails: its two frames disagree here)
              const dG = differ3(cN, cP);
              If(U.interp.greaterThan(.5).and(okP).and(dG.greaterThan(.05)), () => {
                const best = dG.mul(.5).sub(.01).toVar();
                // a block's flow counts only where the bigger block round it (16 pixels) moves the same way (a lone
                // block is more likely a texture that repeats, matched one repeat over), and only a move unlike the
                // game's here, by more than a pixel
                const fs1 = FS[1], par = flowT[1].load(clamp(ivec2(floor(u.mul(fs1))), ivec2(0, 0), ivec2(int(fs1.x).sub(1), int(fs1.y).sub(1)))).xy;
                const near = (a, b) => length(a.sub(b).mul(U.os)).lessThan(1.5);
                const backed = (c, k) => C.reduce((s, o, j) => j === k ? s : s.or(o.w.greaterThan(FLOW_GAIN).and(near(o.xy, c.xy))), near(par, c.xy));
                const fc = vec4(0).toVar();
                for (const [k, c] of C.entries()) {
                  If(c.w.greaterThan(FLOW_GAIN).and(backed(c, k)).and(length(c.xy.sub(d).mul(U.os)).greaterThan(1)), () => {
                    const a = u.sub(c.xy.mul(float(1).sub(U.t))), b = u.add(c.xy.mul(U.t));
                    // both ends the same surface, then and now (not always the game's surface here: a thing that moves with
                    // no motion of its own, a ball on a screen, is in front of it at one end)
                    const za = lin(dep.load(pixOf(a)).x), ok = in01(a).and(in01(b)).and(abs(lin(pdep.load(pixOf(b)).x).sub(za)).lessThan(za.mul(.1).add(.05)));
                    const ca = col.sample(clamp(a, 0, 1)).level(0), cb = pcol.sample(clamp(b, 0, 1)).level(0), d = differ3(ca, cb);
                    If(ok.and(d.lessThan(best)), () => { best.assign(d); fc.assign(mix(cb, ca, U.t)); flowed.assign(1); });
                  });
                }
                // what the flow found, as the picture: where it is a mix of the two real frames' own pixels here (a shadow's
                // edge that has or hasn't reached this pixel yet, half way across its soft rim, a reflection), that mix of
                // them, by how far the flow says it has got: the ground under the shadow keeps its texture exactly, only its
                // light changes. Else the flow's own mix (a thing that is here at this moment and in neither frame here)
                If(flowed.greaterThan(.5), () => {
                  const g = cN.sub(cP), w = clamp(dot(fc.sub(cP).xyz, g.xyz).div(max(dot(g.xyz, g.xyz), 1e-6)), 0, 1), on = mix(cP, cN, w);
                  made.assign(select(differ3(on, fc).lessThan(FLOW_PICK), on, fc));
                });
              });
              // past the newest frame there is nothing to check a flow against: only inside a patch of it (all
              // four blocks round here moving alike, clearly unlike the game's motion), moved by their blend
              If(U.interp.lessThan(.5), () => {
                const all = C.slice(1).reduce((s, c) => s.and(c.w.greaterThan(FLOW_GAIN)).and(length(c.xy.sub(C[0].xy).mul(U.os)).lessThan(1)), C[0].w.greaterThan(FLOW_GAIN));
                const fr = fq.sub(floor(fq)), fl = mix(mix(C[0].xy, C[1].xy, fr.x), mix(C[2].xy, C[3].xy, fr.x), fr.y);
                const a = u.sub(fl.mul(float(1).sub(U.t)));
                If(all.and(in01(a)).and(same(lin(dep.load(pixOf(a)).x))), () => { made.assign(col.sample(a).level(0)); flowed.assign(1); });
              });
            });
          });
          // marked see-through things that weren't lifted and moved, here or where this pixel's colour comes
          // from: the newest frame, unmoved (faint glass is mostly left to the motion, as what shows through it
          // moves with the background)
          const r0 = rea.sample(u).level(0), stat = (r, lift) => r.x.mul(float(1).sub(lift));
          const re = select(isPart, float(0), max(stat(r0, liftAt(u)), stat(rN, liftN))), wr = smoothstep(.2, .7, re);
          // ...unless moving them with what is behind them (the game's motion there: smoke and glass draw none of their
          // own) matches the last frame clearly better than leaving them be: smoke drifting across the view as the
          // camera moves keeps the ground under it moving with the rest of the ground, instead of holding still
          const asDrawn = col.sample(u).level(0).toVar();
          If(wr.greaterThan(0).and(inN), () => {
            const dU = differ3(asDrawn, pcol.sample(u).level(0));
            If(U.interp.greaterThan(.5), () => {
              If(in01(uP).and(differ3(cN, cP).lessThan(dU.mul(.8))), () => { asDrawn.assign(mix(cP, cN, clamp(U.t, 0, 1))); });
            }).Else(() => {
              const was = uN.add(d);
              If(in01(was).and(differ3(cN, pcol.sample(was).level(0)).lessThan(dU.mul(.8))), () => { asDrawn.assign(cN); });
            });
          });
          const fin = mix(made, asDrawn, wr).toVar();
          // a cut to a new scene (nothing matched anywhere): never a mix of the two, just a real frame, the one due
          If(U.flowOn.greaterThan(.5).and(isCut()), () => { fin.assign(select(U.interp.greaterThan(.5).and(U.t.lessThan(1)), pcol.sample(u).level(0), col.sample(u).level(0))); gap.assign(0); });
          If(U.tint.greaterThan(.5).and(flowed.greaterThan(.5)), () => { fin.assign(mix(fin, vec4(1, 0, 1, 1), .6)); });
          // alpha for the pyramid: 0 a gap, else how far away the surface is (far counts more: what a gap
          // uncovers is the background, so it is filled mostly from the background round it, not the thing in front)
          textureStore(this.raw, q, vec4(fin.xyz, select(gap.greaterThan(.5), float(0), clamp(L.div(40), .02, 1))));
        });
      });
    })().compute(nt * 64, [64]);

    // 7 the gap-filling pyramid: each level the weighted average of the surfaces found below it
    const rawT = texture(this.raw), pyrT = this.pyr.map(t => texture(t)), hiO = ivec2(int(U.os.x).sub(1), int(U.os.y).sub(1));
    this.cPyr = this.pyr.map((t, k) => Fn(() => {
      const s = PS[k], p = ivec2(int(instanceIndex).mod(int(s.x)), int(instanceIndex).div(int(s.x)));
      if (k) { textureStore(t, p, pyrT[k - 1].sample(vec2(p).mul(2).add(1).div(PS[k - 1])).level(0)); return; }
      let sum = vec4(0);
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const c = rawT.load(clamp(p.mul(2).add(ivec2(x, y)), ivec2(0, 0), hiO)); sum = sum.add(vec4(c.xyz.mul(c.w), c.w)); }
      textureStore(t, p, sum.mul(.25));
    })().compute(sz(k + 1)[0] * sz(k + 1)[1], [64]));
    // 8 the finished frame: each gap takes the finest level of the pyramid that has surfaces round it
    this.cInpaint = Fn(() => {
      const i = int(instanceIndex), q = ivec2(i.mod(OW), i.div(OW)), u = vec2(q).add(.5).div(U.os), c = rawT.load(q), out = vec3(c.xyz).toVar();
      If(c.w.lessThanEqual(0).and(U.fillOn.greaterThan(.5)), () => {
        const done = float(0).toVar();
        for (const P of pyrT) If(done.lessThan(.5), () => { const s = P.sample(u).level(0); If(s.w.greaterThan(1e-3), () => { out.assign(s.xyz.div(s.w)); done.assign(1); }); });
      });
      textureStore(this.output, q, vec4(out, 1));
    })().compute(on, [64]);

    // 6 keep the newest frame as next time's last frame (with its motion, for next time's curve)
    this.cKeepC = handed ? null : Fn(() => { const i = int(instanceIndex), q = ivec2(i.mod(OW), i.div(OW)); textureStore(this.prevColor, q, col.sample(vec2(q).add(.5).div(U.os)).level(0)); })().compute(on, [64]);
    this.cKeepD = Fn(() => {
      const p = xy(instanceIndex), r = rea.load(p), cover = select(movingOf(r, U.rs).greaterThan(.5), max(r.x, .001).negate(), r.x);
      textureStore(this.prevDepth, p, vec4(dep.load(p).x, cover, back(vel.load(p).xy)));
    })().compute(n, [64]);
  }

  /**
   * After a real frame: keeps it. o: { color, velocity, reactive (optional: frameGenMRT's mask), depth (three Textures), renderSize, outputSize
   * (Vector2 or [w, h]), camera (for its near and far, and its turn), jitter (this frame's SGSR 2 jitter in NDC, [0, 0] if none),
   * jitterDelta (this frame's jitter minus last frame's, in NDC; [0, 0] if none), prevColor (optional: the last real frame's
   * finished picture, when the caller still has it and leaves it alone until the next real frame: then it is read where it is
   * instead of being copied. Every frame or none: changing over starts again), eightBit (optional: true when the pictures
   * are finished screen colours in 0..1, not HDR: the made frame is then kept in 8 bits a channel, as the screen shows it) }.
   * The previous frame stays in prev until keep(), so make() works between the last two real frames.
   */
  real(o) {
    const rs = o.renderSize, os = o.outputSize, rw = rs.x ?? rs[0], rh = rs.y ?? rs[1], ow = os.x ?? os[0], oh = os.y ?? os[1];
    this.build(rw, rh, ow, oh, !!o.prevColor, !!o.eightBit);
    /** The last real frame's finished picture (the one handed in, or our copy). */
    this.prev = this.pcolN.value = o.prevColor || this.prevColor;
    this.colN.value = o.color; this.velN.value = o.velocity; this.depN.value = o.depth; this.reaN.value = o.reactive || NO_REACTIVE; this.U.rs.value.set(rw, rh); this.U.os.value.set(ow, oh);
    const U = this.U, P = this.poses;
    if (o.camera) { U.near.value = o.camera.near; U.far.value = o.camera.far; }
    const jd = o.jitterDelta || [0, 0]; U.jd.value.set(jd.x ?? jd[0], jd.y ?? jd[1]);
    // the camera's last three poses, and its turns between them
    P.unshift(P.pop());
    if (o.camera) poseOf(o.camera, o.jitter, P[0]); else copyPose(P[1], P[0]);
    this.frames++; this.stats.real++;
    this.ready = this.frames >= 2;
    homography(P[0], this.frames >= 2 ? P[1] : P[0], U.Hb.value);
    homography(P[1], this.frames >= 3 ? P[2] : P[1], U.Hb2.value);
    U.hist.value = this.frames >= 3 ? 1 : 0;
  }
  /** Call after the last make() between a pair and BEFORE the next real frame is drawn: copies the newest frame to be next time's last frame. */
  keep() {
    if (!this.frames) return;
    const list = this.cKeepC ? [this.cKeepC, this.cKeepD] : [this.cKeepD]; list.gsPart = this.parts ? 'fg:keep' : 'fg';
    this.r.compute(list);
  }
  /** The share of the screen's tiles (0..1) that took the quick way at the last pair's made frames (a read back: tests and the phone test tour). */
  async easyShare() {
    if (!this.cutAttr || !this.sorted || !this.tileCount) return null;
    const c = new Uint32Array(await this.r.getArrayBufferAsync(this.cutAttr));
    return Math.min(1, c[69] / this.tileCount);
  }
  /** The camera's pose at t (0 the last real frame, 1 the newest, more is past it), into out. */
  poseAt(t, out = newPose()) { return this.frames >= 2 ? lerpPose(this.poses[1], this.poses[0], t, out) : copyPose(this.poses[0], out); }
  /**
   * Makes the frame at t into this.output (a StorageTexture at the screen's size): 0 < t < 1 between the
   * last two real frames (needs keep() to have run before the newest real frame), t > 1 past the newest.
   * Returns false if there aren't two real frames yet.
   */
  make(t = .5) {
    if (!this.ready) return false;
    const r = this.r, t0 = performance.now(), U = this.U;
    U.t.value = t; U.interp.value = t <= 1 ? 1 : 0;
    homography(this.poses[0], this.poseAt(t, TP), U.Ht.value);
    // one compute pass: WebGPU finishes each step's writes before the next step reads them. The optical
    // flow (and the cut check that comes with it) is worked out once for each pair of real frames.
    // The tile sort (which tiles take compose's quick way) is done with it, and shared by all the frames made
    // between the pair: everything that doesn't depend on the moment made is worked out once.
    const moving = [this.cClear, this.cSplat, this.cResolve, this.cFill], motion = [];
    if (this.flowFor !== this.frames) {
      this.flowFor = this.frames; motion.push(this.cCutClear);
      if (U.flowOn.value) motion.push(...this.cLum, ...this.cFlow, this.cCutDecide);
      this.sorted = !!(U.flowOn.value && U.quick.value); if (this.sorted) motion.push(this.cMarkClear, this.cMark, this.cTiles);
    }
    U.go.value = this.sorted && U.quick.value ? 1 : 0;
    const filling = U.fillOn.value ? [...this.cPyr, this.cInpaint] : [this.cInpaint];
    // marked for the app's chip time (hd3d.js gpuTime): 'fg' as one pass; with parts on (the phone test tour),
    // each step its own pass, so the report says where a made frame's time goes
    if (this.parts) {
      const run = (list, part) => { if (list.length) { list.gsPart = part; r.compute(list); } };
      run(moving, 'fg:moving'); run(motion, 'fg:motion'); run([this.cCompose], 'fg:picture'); run(filling, 'fg:holes');
    } else { const list = [...moving, ...motion, this.cCompose, ...filling]; list.gsPart = 'fg'; r.compute(list); }
    r.gsMade = (r.gsMade || 0) + 1;   // (frames made since the app last counted: hd3d.js gpuTime shares frame generation's chip time among them)
    this.stats.made++; this.stats.ms = this.stats.ms * .9 + (performance.now() - t0) * .1;   // CPU time to queue it (the GPU time is measured by the app)
    return true;
  }
  /** Forget the last frames (a camera cut, a new round, a resize): nothing is made until two new real frames. */
  reset() { this.frames = 0; this.ready = false; this.flowFor = -1; this.sorted = false; }
  dispose() {
    for (const k of ['prevColor', 'blank', 'prevDepth', 'midMotion', 'midBend', 'filled', 'filledBend', 'raw', 'output']) { this[k]?.dispose(); this[k] = null; }
    for (const k of ['lum', 'flow', 'pyr']) { for (const t of this[k] || []) t.dispose(); this[k] = null; }
    for (const k of ['cClear', 'cSplat', 'cResolve', 'cFill', 'cCompose', 'cKeepC', 'cKeepD', 'cCutClear', 'cCutDecide', 'cInpaint', 'cMarkClear', 'cMark', 'cTiles']) { this[k]?.dispose?.(); this[k] = null; }
    for (const k of ['cLum', 'cFlow', 'cPyr']) { for (const c of this[k] || []) c.dispose?.(); this[k] = null; }
    this.keysAttr = this.cutAttr = this.marksAttr = this.tilesAttr = this.prev = null; this.key = ''; this.flowFor = -1; this.sorted = false;
  }
}
const TP = newPose();

/**
 * Which refresh after the newest real frame this one is (1 the next), from the schedule the 3D kit keeps
 * ({ at: the real frame's time, ms: a refresh, k: the last refresh shown }) and this refresh's time: by
 * the clock, so one the phone skipped is counted and the picture stays on time, never back or the same
 * moment twice. Without a time, simply the next.
 */
export function refreshesSince(S, now) {
  if (now == null || !(S.ms > 0)) return S.k + 1;
  return Math.max(S.k + 1, Math.round((now - S.at) / S.ms));
}

/**
 * Still-picture check (src/kit/hd3d-gpu.js): compares a sixteenth of the finished frame's pixels with the
 * last frame's and counts the ones that changed visibly, so the app can stop redrawing a scene where
 * nothing moves. check(color, w, h) queues it; changed() is the count from a frame or two ago (a read back
 * that never waits), or -1 while none has come back.
 */
export class StillCheck {
  constructor(r) { this.r = r; this.key = ''; this.count = -1; this.busy = false; this.seen = 0; }
  build(w, h) {
    const sw = Math.max(1, w >> 2), sh = Math.max(1, h >> 2), key = `${sw}x${sh}`;
    if (key === this.key) return;
    this.dispose(); this.key = key; this.n = sw * sh; this.fresh = true;
    this.lumA = new StorageBufferAttribute(new Float32Array(this.n), 1);
    this.cntA = new StorageBufferAttribute(new Uint32Array(1), 1);
    const lum = storage(this.lumA, 'float', this.n), cnt = storage(this.cntA, 'uint', 1).toAtomic();
    const col = this.colN = texture(NO_REACTIVE), sz = this.sz = uniform(new Vector2(1, 1)), SW = max(int(sz.x).shiftRight(2), int(1));   // (the size as a uniform: see FrameGen.build)
    this.cZero = Fn(() => { atomicStore(cnt.element(0), uint(0)); })().compute(1, [1]);
    this.cCmp = Fn(() => {
      const i = int(instanceIndex), q = vec2(ivec2(i.mod(SW), i.div(SW))).mul(4).add(2).div(sz);
      const l = dot(col.sample(q).level(0), LUMA), was = lum.element(i);
      If(abs(l.sub(was)).greaterThan(2 / 255), () => { atomicAdd(cnt.element(0), uint(1)); });
      lum.element(i).assign(l);
    })().compute(this.n, [64]);
  }
  check(color, w, h) {
    this.build(w, h); this.colN.value = color; this.sz.value.set(w, h);
    this.r.compute([this.cZero, this.cCmp]);
    if (this.fresh) { this.fresh = false; return; }   // the first compare is against nothing
    if (this.busy) return;
    this.busy = true; const key = this.key;
    this.r.getArrayBufferAsync(this.cntA).then(b => { if (key === this.key) { this.count = new Uint32Array(b)[0]; this.seen++; } }).catch(() => {}).finally(() => { this.busy = false; });
  }
  /** Changed pixels (a sixteenth sampled) in a recent frame, or -1 if not known yet. */
  changed() { return this.count; }
  reset() { this.count = -1; this.fresh = true; }
  dispose() { for (const k of ['cZero', 'cCmp']) { this[k]?.dispose?.(); this[k] = null; } this.lumA = this.cntA = null; this.key = ''; }
}
