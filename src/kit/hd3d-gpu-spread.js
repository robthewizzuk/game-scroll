// Heavy screen effects spread over frames (WebGPU; HD.spread, on unless set false).
//
// Ambient occlusion, volumetric light and live bounce light each take only a part of their samples in a frame,
// with a pattern that turns from frame to frame, and the frames before fill in the rest: each pixel keeps what it
// had (moved to where that point is now on screen) and blends in this frame's samples. On a still camera the
// blend slows, so the picture settles (and the app's still-frame check can stop redrawing). Where a point was
// hidden last frame, or the camera jumped, the frame's own samples are used, smoothed over their neighbours.
// The same idea as the big engines' temporal effects (GTAO's own rotations, Unreal's and Frostbite's
// half-sampled passes filled from history); the Fold is bound by pixels, and three quarters of its frame went
// on the passes after the scene (2026-11-13), so these are the ones made cheaper.
//
//   SpreadFrame: the chain's camera numbers this frame and last (one per chain, frame() each frame drawn)
//   SpreadNode:  one effect's picture, blended with its history at the effect's own size
//   ownFrames(node, S): three's GTAO and SSGI turn their pattern by the renderer's frame number; this makes
//     them turn by the chain's own count, so the same frames always make the same picture (tests compare them)
//
// Kit use only (hd3d-gpu.js).
import { Node, QuadMesh, NodeMaterial, RendererUtils, RenderTarget, HalfFloatType, RGFormat, Vector2, Matrix4 } from 'three/webgpu';
import { Fn, NodeUpdateType, uniform, uv, vec2, vec4, float, min, max, abs, clamp, mix, select, getViewPosition, passTexture, texture, context, length } from 'three/tsl';

const Q = new QuadMesh();
let RS;   // (three fills it in: undefined, not null, the first time)
// (three's own GTAO and SSGI patterns: six turns of the directions and four starting offsets)
const ROT = [60, 300, 180, 240, 120, 0], OFF = [0, .5, .25, .75];
// neighbours read for the frame's own value and the range history is held to
const VIEW_STEP = .1;
// frames of calm (the camera still and nothing that moves the light) after which the picture is held as it is: the
// patterns stop turning and no more of each frame is blended in, so it stops changing and the app's still-frame check
// can stop drawing (it waits for no change at all). Ambient occlusion and bounce light still follow what changes,
// held to their neighbours' range; volumetric light starts again when the light or a shadow map is drawn again.
const SETTLE = 48;
const CROSS = [[0, -1], [-1, 0], [1, 0], [0, 1]], BOX = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** The camera this frame and last, and how long it has been calm (see SETTLE). One per chain. */
export class SpreadFrame {
  constructor() {
    this.f = 0; this.calm = 0; this.reset = true; this.had = false;
    this.prevV = uniform(new Matrix4()); this.prevP = uniform(new Matrix4()); this.invProj = uniform(new Matrix4()); this.camWorld = uniform(new Matrix4());
    // a turn added to each pixel's own noise (interleaved gradient noise) every frame: the golden ratio's fraction, so over
    // frames every pixel's offsets fill 0..1 evenly. (Jimenez's 5.588238 pixels a frame moves the pattern instead; a pixel
    // then sees only a handful of offsets and kept a bias of its own: the air above the beams came out a little dark)
    this.turn = uniform(0);
    this.lastV = new Matrix4(); this.lastP = new Matrix4(); this.key = new Float64Array(32);
    this.moved = 0;   // (how far the camera went since the last frame, in metres)
    // SGSR 2 moves the camera by a fraction of a pixel each frame (its jitter), and the camera's move and the motion picture
    // both include the change. History is read without it, at the same place on the pixel grid: read where the jitter
    // put the point, a still picture was moved a fraction of a pixel and smoothed again every frame, softer and softer
    this.jit = uniform(new Vector2());
  }
  /**
   * Before the chain draws: cam, cut (true: nothing from earlier frames belongs to this one), stir (the light moved or a
   * shadow map was drawn again), jd (SGSR 2's jitter now less last frame's, in clip space: x right, y up; or nothing).
   */
  frame(cam, cut, stir, jd) {
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements, p = cam.projectionMatrix.elements, k = this.key; let same = this.had;
    // (SGSR 2's jitter moves the projection by a fraction of a pixel each frame, in 8 and 9: that isn't the camera moving)
    for (let i = 0; i < 16; i++) { if (k[i] !== e[i]) { same = false; k[i] = e[i]; } if (i !== 8 && i !== 9 && k[16 + i] !== p[i]) { same = false; k[16 + i] = p[i]; } }
    this.reset = !!cut || !this.had; this.calm = same && !this.reset && !stir ? this.calm + 1 : 0;
    this.moved = this.reset ? 0 : Math.hypot(e[12] - this.lastV.gsX, e[13] - this.lastV.gsY, e[14] - this.lastV.gsZ); this.lastV.gsX = e[12]; this.lastV.gsY = e[13]; this.lastV.gsZ = e[14];
    this.prevV.value.copy(this.reset ? cam.matrixWorldInverse : this.lastV); this.prevP.value.copy(this.reset ? cam.projectionMatrix : this.lastP);
    this.lastV.copy(cam.matrixWorldInverse); this.lastP.copy(cam.projectionMatrix);
    this.invProj.value.copy(cam.projectionMatrixInverse); this.camWorld.value.copy(cam.matrixWorld);
    this.f = this.reset ? 0 : this.calm >= SETTLE ? this.f : this.f + 1;
    this.jit.value.set(jd && !this.reset ? jd[0] * .5 : 0, jd && !this.reset ? -jd[1] * .5 : 0);
    this.turn.value = this.f * .6180339887 % 1;
    this.had = true;
  }
}

/** Make three's GTAO or SSGI node (temporal filtering on) turn its pattern by S's frame count, not the renderer's. */
export function ownFrames(node, S) {
  node.useTemporalFiltering = true;
  // (their updateBefore reads only the renderer and the frame number)
  const ub = node.updateBefore, fr = { frameId: 0, renderer: null };
  node.updateBefore = function (frame) { fr.renderer = frame.renderer; fr.frameId = S.f; return ub.call(this, fr); };
  return node;
}

/**
 * One effect's picture blended with its own history. src: the effect's picture this frame (a texture node; its
 * size is the size this works at), depth: the scene's depth, S: the chain's SpreadFrame. Options: vel (the scene's
 * motion picture, when there is one: things that move are followed too, not only the camera), alpha (how much of
 * this frame goes in while the camera moves), keep (frames blended at most while it is calm), wide (nine
 * neighbours, not five: for the noisiest, ambient occlusion), one (a single value in red, not a colour), hold (history is
 * held to the range this frame's neighbours span, so what changed doesn't linger; false for volumetric light: a few steps
 * along a ray through a thin beam mostly all miss it, with now and then one that hits, so a frame's range often sat at
 * nothing and held the beam down to it, darkening it by a tenth; its history is dropped only where the point behind
 * was hidden or off screen, and it blends faster instead),
 * part (the chip-time name of its pass).
 */
export class SpreadNode extends Node {
  static get type() { return 'SpreadNode'; }
  constructor(src, depth, S, { vel = null, alpha = .12, keep = 32, wide = false, one = false, hold = true, view = false, part = 'effects' } = {}) {
    super('vec4');
    this.updateBeforeType = NodeUpdateType.FRAME;
    Object.assign(this, { src, depth, vel, S, alpha, keep, wide, one, hold, view });
    // the value (red, or red to blue) and the point's distance from the camera (green, or alpha) for the next frame's check
    const mk = () => new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, ...(one ? { format: RGFormat } : {}) });
    this.rt = mk(); this.hist = mk(); this.rt.gsPart = part; this.rt.texture.name = 'Spread ' + part; this.hist.texture.name = 'Spread history ' + part;
    this.histN = texture(this.hist.texture); this.A = uniform(1); this.px = uniform(new Vector2(1, 1));
    this.mat = new NodeMaterial(); this.mat.name = 'Spread ' + part;
    this.out = passTexture(this, this.rt.texture);
    this.fresh = true; this.n = 0;
  }
  getTextureNode() { return this.out; }
  updateBefore(frame) {
    const r = frame.renderer, img = this.src.value?.image, w = img?.width | 0, h = img?.height | 0;
    if (!w || !h) return;
    if (this.rt.width !== w || this.rt.height !== h) { this.rt.setSize(w, h); this.hist.setSize(w, h); this.fresh = true; }
    this.px.value.set(1 / w, 1 / h);
    // how much of this frame goes in: after a cut or a new size, this frame alone, then an even share of the frames
    // since (n), until that is less than the moving blend (alpha); while calm it slows on to 1 in keep, and from SETTLE
    // frames of calm none
    const S = this.S, n = this.n = this.fresh || S.reset ? 0 : this.n + 1, c = Math.min(S.calm, n);
    let a = c >= SETTLE ? 0 : Math.max(c > 0 ? Math.max(1 / this.keep, 1 / (1 / this.alpha + c)) : this.alpha, 1 / (1 + n));
    // (view: the value hangs on where the camera stands, not only on the point, so the frames before are worth less the
    // further it has gone, and from VIEW_STEP a frame this frame's alone: in the test room, running through the beams at
    // 9 cm a frame came out a fortieth darker blended as if still, and right from VIEW_STEP .08 to .1)
    if (this.view) a += (1 - a) * Math.min(1, S.moved / VIEW_STEP);
    this.A.value = a;
    RS = RendererUtils.resetRendererState(r, RS);
    try {
      r.setRenderTarget(this.rt); Q.material = this.mat; Q.name = this.mat.name; Q.render(r);
      r.copyTextureToTexture(this.rt.texture, this.hist.texture);
    } finally { RendererUtils.restoreRendererState(r, RS); }
    this.fresh = false;
  }
  setup(builder) {
    // (what this reads is drawn first: the scene's pass, the effect's own)
    this.depth.build(builder); this.src.build(builder); this.vel?.build(builder);
    this.mat.contextNode = context(builder.getSharedContext());
    this.mat.fragmentNode = this.resolve(); this.mat.needsUpdate = true;
    return this.out;
  }
  resolve() {
    const { S, src, depth: D, histN: H, px, A, vel, one } = this, alpha = this.alpha, taps = this.wide ? BOX : CROSS;
    const val = q => one ? src.sample(q).r : src.sample(q).rgb, distAt = q => getViewPosition(q, D.sample(q).r, S.invProj).z.negate();
    return Fn(() => {
      const q = uv(), vp = getViewPosition(q, D.sample(q).r, S.invProj).toConst(), z = vp.z.negate().toConst();
      // this frame's value: its own and its neighbours' on the same surface (by distance), and the range they span
      const c = val(q).toConst(), lo = c.toVar(), hi = c.toVar(), sum = c.mul(2).toVar(), ws = float(2).toVar(), tol = z.mul(.05).add(.02).toConst();
      // (only neighbours on the same surface set the range: across an edge, the far side's values would let a stale one stay)
      for (const [i, j] of taps) {
        const p = q.add(px.mul(vec2(i, j))), v = val(p).toConst(), same = abs(distAt(p).sub(z)).lessThan(tol).toConst(), w = select(same, float(1), float(.05));
        sum.addAssign(v.mul(w)); ws.addAssign(w);
        lo.assign(select(same, min(lo, v), lo)); hi.assign(select(same, max(hi, v), hi));
      }
      const cur = sum.div(ws);

      // where this point was last frame: by the motion picture where there is one, else by the camera's move
      const pv = S.prevV.mul(S.camWorld.mul(vec4(vp, 1))).toConst(), pc = S.prevP.mul(pv).toConst(), was = pv.z.negate();
      // (both with SGSR 2's jitter taken back out: S.jit; mv is then the point's own move on screen)
      const mv = vel ? vel.sample(q).xy.mul(vec2(.5, -.5)).sub(S.jit).toConst() : null;
      const pq = (mv ? q.sub(mv) : pc.xy.div(max(abs(pc.w), 1e-6)).mul(vec2(.5, -.5)).add(.5).add(S.jit)).toConst();
      const h = H.sample(pq), hz = one ? h.g : h.a, hv = one ? h.r : h.rgb;
      // history counts if the point was on screen, at the distance it was (not something in front of it then)
      const ok = pq.x.greaterThanEqual(0).and(pq.x.lessThanEqual(1)).and(pq.y.greaterThanEqual(0)).and(pq.y.lessThanEqual(1))
        .and(pc.w.greaterThan(0)).and(hz.greaterThan(0)).and(abs(hz.sub(was)).lessThan(was.mul(.06).add(.05)));
      // (a thing moving across a still view: at least the moving blend there)
      const a = mv ? max(A, select(length(mv).greaterThan(.0005), float(alpha), float(0))) : A;
      const out = mix(this.hold ? clamp(hv, lo, hi) : hv, cur, select(ok, a, float(1)));
      return one ? vec4(out, z, 0, 1) : vec4(out, z);
    })();
  }
  dispose() { super.dispose(); this.rt.dispose(); this.hist.dispose(); this.mat.dispose(); }
}
