// The puddle mirror on WebGPU (mirror.js says what it is and when it runs): the scene drawn small from the camera turned over
// in the ground's plane, then a pass that takes the sky off it (what a puddle's material reflects there already: the scene's
// surroundings along each pixel's own direction), into a mipmapped picture the mirror's meshes read (mirrorLight, from
// hd3d-gpu.js gpuWet). The shaders for the scene drawn into the mirror's picture are built in the background first (three's
// compileAsync, as the far world's are: hd3d-gpu-far.js), and nothing is drawn into it until they are in.
// Kit use only (hd3d.js mirrorStep).
import { RenderTarget, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, NodeMaterial, QuadMesh, Color, Matrix4, Vector3, DataTexture } from 'three/webgpu';
import { Fn, uniform, texture, uv, vec2, vec3, vec4, float, normalize, max, clamp, pow, dot, pmremTexture, positionWorld, cameraPosition, renderGroup } from 'three/tsl';
import { MIRROR } from './mirror.js';

let BLANK = null;
const blank = () => BLANK ||= Object.assign(new DataTexture(new Uint16Array([0, 0, 0, 0]), 1, 1, undefined, HalfFloatType), { minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, needsUpdate: true });
// the frame's mirror numbers, for every material that shows it (the whole frame's: renderGroup)
const MU = {
  on: uniform(0).setGroup(renderGroup).onRenderUpdate(() => MIRROR.on),
  lod: uniform(6).setGroup(renderGroup).onRenderUpdate(() => MIRROR.lod),
  vp: uniform(new Matrix4()).setGroup(renderGroup).onRenderUpdate(() => MIRROR.vp),
};
const CC = new Color();

/**
 * What the mirror adds to a wet ground's light (an emissive node): its picture where the water is (w: how much water, 0..1),
 * in place of the sky there, by the water's Fresnel term (n: the surface's normal in the world; rough: its roughness).
 * hd3d.js AIR_WET has the same sums for WebGL.
 */
export function mirrorLight(w, n, rough) {
  const t = texture(blank()).onRenderUpdate(() => MIRROR.gpuTex || blank());
  return Fn(() => {
    const c = MU.vp.mul(vec4(positionWorld, 1)), q = clamp(c.xy.div(c.w).mul(vec2(.5, -.5)).add(.5).add(n.xz.mul(vec2(.06, -.06))), .002, .998);
    const v = normalize(cameraPosition.sub(positionWorld)), nv = clamp(dot(n, v), 0, 1);
    const fr = float(.04).add(max(float(1).sub(rough), .04).sub(.04).mul(pow(float(1).sub(nv), 5)));
    const m = t.sample(q).level(clamp(rough.sub(.03).mul(16), 0, MU.lod));
    return m.rgb.mul(fr).mul(w).mul(MU.on);
  })();
}

export class Mirror {
  constructor(r) {
    this.r = r; this.A = null; this.B = null; this.ready = false; this.compiling = null; this.w = 0; this.h = 0;
    this.U = { ivp: uniform(new Matrix4()), at: uniform(new Vector3()), envI: uniform(1) };
    this.aT = texture(blank()); this.env = null; this.envN = null;
    this.info = { w: 0, h: 0, drawn: 0, why: 'starting' };
  }
  // the pass that takes the sky off: what the picture holds, less the scene's surroundings along each pixel's direction where it holds something
  quadFor(env) {
    if (this.quad && !!this.env === !!env) { if (env && this.envN.value !== env) this.envN.value = env; this.env = env; return this.quad; }   // (a new sky: the same pass reads it)
    this.quad?.material.dispose(); this.env = env;
    const U = this.U, A = this.aT, m = new NodeMaterial(); m.name = 'Puddle mirror'; m.toneMapped = false; m.fog = false; m.lights = false;
    m.fragmentNode = Fn(() => {
      const q = uv(), c = A.sample(q);
      let sky = vec3(0);
      if (env) {
        const p = U.ivp.mul(vec4(q.x.mul(2).sub(1), float(1).sub(q.y.mul(2)), .5, 1)), d = normalize(p.xyz.div(p.w).sub(U.at));
        this.envN = pmremTexture(env, d, float(.06)); sky = this.envN.rgb.mul(U.envI);
      }
      return vec4(c.rgb.sub(sky.mul(c.a)), 1);
    })();
    this.quad = new QuadMesh(m);
    return this.quad;
  }
  size(w, h) {
    if (this.A && this.w === w && this.h === h) return;
    this.A?.dispose(); this.B?.dispose(); this.w = w; this.h = h;
    this.A = new RenderTarget(w, h, { type: HalfFloatType, depthBuffer: true, minFilter: LinearFilter, magFilter: LinearFilter });
    this.B = new RenderTarget(w, h, { type: HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter });
    this.A.texture.name = 'puddle mirror (scene)'; this.B.texture.name = 'puddle mirror';
    this.A.gsPart = this.B.gsPart = 'mirror';   // (hd3d.js gpuTime: the chip's time by pass)
    this.aT.value = this.A.texture; this.info.w = w; this.info.h = h;
    MIRROR.lod = Math.max(0, Math.floor(Math.log2(Math.min(w, h))) - 2);
  }
  /** Draw the scene from cam (mirror.js mirrorCamera) and take the sky off it. False while its shaders are still being built. */
  draw(scene, cam, nw = null) {
    const r = this.r, was = r.getRenderTarget(), mrt = r.getMRT(), cc = r.getClearColor(CC), ca = r.getClearAlpha();
    if (!this.ready) {
      if (!this.compiling) {
        // (three's queued builds put back the target they were made for once each is done: each is told to put back what was there before, as hd3d-gpu-far.js does)
        const make = r._createObjectPipeline, own = typeof make === 'function';
        if (own) r._createObjectPipeline = function (...a) {
          const list = this._compilationPromises, n = list ? list.length : 0; make.apply(this, a);
          if (list) for (let i = n; i < list.length; i++) { const st = list[i].precompilationState; if (st) { st.outputRenderTarget = was; st.outputMRT = mrt; } }
        };
        r.setRenderTarget(this.A); r.setMRT(null);
        try { this.compiling = r.compileAsync(scene, cam) || Promise.resolve(); }
        catch (e) { this.compiling = Promise.resolve(); }
        finally { if (own) delete r._createObjectPipeline; r.setRenderTarget(was); r.setMRT(mrt); }
        this.compiling.then(() => { this.ready = true; }, () => { this.ready = true; });
      }
      this.info.why = 'building';
      return false;
    }
    const U = this.U, q = this.quadFor(scene.environment || null);
    U.ivp.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert(); U.at.value.setFromMatrixPosition(cam.matrixWorld); U.envI.value = scene.environmentIntensity ?? 1;
    try {
      r.setMRT(null); r.setRenderTarget(this.A); r.setClearColor(0x000000, 0); r.clear();
      if (nw) nw.begin();
      try { r.render(scene, cam); } finally { if (nw) nw.end(); }
      r.setRenderTarget(this.B); q.render(r);
    } finally { r.setClearColor(cc, ca); r.setRenderTarget(was); r.setMRT(mrt); }
    MIRROR.gpuTex = this.B.texture; this.info.drawn++; this.info.why = '';
    return true;
  }
  dispose() { this.A?.dispose(); this.B?.dispose(); this.quad?.material.dispose(); this.A = this.B = this.quad = null; if (MIRROR.gpuTex) MIRROR.gpuTex = null; }
}
