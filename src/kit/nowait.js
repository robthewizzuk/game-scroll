// No frame waits for a shader (WebGPU). The kit builds a scene's shaders ahead, under the loading screen (precompile,
// buildAhead, shadowAhead), from the notes of earlier rounds (pipes.js) and for things that come in during play
// (holdNew). Whatever still slips past all of those (a look first met a minute into a round, a light setting not seen
// before, a thing let go by the hold's time limit, a shadow of a new kind of thing) was built by three in the middle
// of the frame that first drew it: three writes the shader's text on the main thread (tens to hundreds of
// milliseconds on a phone for a lit, skinned, close-up material) and asks the driver for its pipeline at once, which
// the chip then waits on. Rob's Fold, Long Shadow, 2026-11-15: 58 such frames in a minute, the worst 1.3 s.
//
// Here the view's own frame (its scene pass and the shadow maps drawn inside it) never does either:
//  - a thing whose shader text three has not written yet is left out of this frame, and the build is queued as
//    three's own compileAsync queues one: with the renderer's state as it is at that moment (the picture drawn
//    into, its outputs, the render context), which the build puts back on when its turn comes, between frames;
//    the text is written a stage at a time with the main thread given back between (three's buildAsync), at most
//    NOWAIT.ms of it before the next frame is let through;
//  - a thing whose text is there but whose pipeline is not has the pipeline asked for in the background
//    (createRenderPipelineAsync), and three leaves it out of the frame until it lands (Pipelines.isReady).
// The thing shows a frame or a few later; the frame never stops. That is the stand-in: the frames go on with what is
// built, as an engine with asynchronous shader builds does (Unreal's, Unity's async shader compilation draws a
// placeholder; three's own render path has the same "not ready, not drawn" rule for pipelines being built).
//
// Not deferred: the effects' full-screen passes (a QuadMesh: left out, the picture would be wrong, not late), a card's
// picture (baking: drawn once), anything drawn outside the view's frame (a bake, a cube map, an impostor, a test
// that renders by hand: drawn once and kept), things marked userData.noHold === 'wait', and NOWAIT.on = false.
// Nor a view's first frame (hd3d.js), nor a render whose lights, sky or fog changed since that camera's last one
// (every lit shader is new at once: left out, the whole scene would go for a while, which is worse than a late frame;
// tiers change between rounds, under the loading screen, for the same reason).
// The builds share the renderer's one build queue with the kit's other background builds (r.gsCompiling, hd3d.js
// compileGPU: three keeps a build's state in one field of the renderer), and count in r.gsBuilding, which the
// loading screen waits on, so a round still starts with everything its first frames draw.
// Kit use only: games never see this.

/** on: false draws as three does (builds in the frame). ms: main-thread time a turn of the queue takes before the next frame. most: times in a row one thing is put off (for one camera, with no frame drawing it between) before it is drawn as three does. */
export const NOWAIT = { on: true, ms: 6, most: 12 };
/** Counts (tests, the frame lab): texts and pipelines put off from a frame, the queued builds done and failed, draws built in the frame for a change of lights, sky or fog (env), and the shader programs the queued builds made (programs: the frame lab leaves them out of its "shaders built" in a frame). */
export const NOWAIT_STATS = { texts: 0, pipes: 0, built: 0, failed: 0, dropped: 0, frames: 0, env: 0, programs: 0, names: [] };

/**
 * Installs the deferral on a WebGPU renderer (gpu.js, once it is made). It acts only between r.gsNoWait.begin() and
 * end() (hd3d.js drawGPU: around the view's own frame).
 */
export function noWait(r) {
  if (!r || r.gsNoWait || typeof r._renderObjectDirect !== 'function' || !r._nodes || !r._pipelines) return;
  const Q = r.gsNoWait = { on: 0, list: [], has: new Set(), sink: null, sync: false, env: new WeakMap(), frame: 0, counted: new Set(), running: false, inflight: 0, done: 0,
    begin() { this.on++; }, end() { this.on = Math.max(0, this.on - 1); },
    /** things put off and not drawable yet (their text or pipeline still on its way) */
    get pending() { return this.list.length + this.inflight + (this.running ? 1 : 0); } };
  const direct = r._renderObjectDirect, N = r._nodes, P = r._pipelines;
  // A render object made in a frame and left out of it has no bindings yet. three, freeing one (the thing thrown away
  // before its turn: a game's reset() under the loading screen), asks for its bindings, which writes its shader's text
  // there and then, and takes one off the count of each group it shares, the camera's and lights' block among them,
  // though it never added one: the block's buffer was freed under everything else, and the next frame's write to it
  // threw (Long Shadow's round never started). One never set up has nothing to free.
  const B = r._bindings, del = B?.deleteForRender;
  if (typeof del === 'function') B.deleteForRender = function (ro) { if (this.get(ro).initialized !== true) { this.delete(ro); return; } return del.call(this, ro); };
  // a pipeline asked for in the frame: in the background while the view's frame is being drawn
  const upd = P.updateForRender;
  P.updateForRender = function (ro) {
    if (!Q.on || !NOWAIT.on || Q.sync) return upd.call(this, ro);
    const s = Q.sink ||= [], n = s.length;
    this.getForRender(ro, s);
    if (s.length > n) { NOWAIT_STATS.pipes += s.length - n; name(ro, 'pipeline'); }
    return this.get(ro).pipeline;
  };
  const asIs = (self, a) => { const was = Q.sync; Q.sync = true; try { return direct.apply(self, a); } finally { Q.sync = was; } };
  r._renderObjectDirect = function (object, material, scene, camera, lightsNode, group, clippingContext, passId) {
    if (!Q.on || !NOWAIT.on || object.isQuadMesh || this._compilationPromises !== null || object.userData?.noHold === 'wait' || (material.isShaderMaterial && !material.isNodeMaterial)) return asIs(this, arguments);   // (a WebGL ShaderMaterial: three has no shader for it to put off)
    // (the scene's lights, sky or fog changed since this camera's last frame: every lit shader is new at once, and left
    // out it would be the whole scene gone for a while, not one thing late: that frame builds as three does, as before.
    // Per camera and per frame of the view, not per render: three draws the shadow maps inside the scene's render, and
    // the kit draws the same camera more than once a frame)
    let ek = null; try { ek = N.getCacheKey(scene, lightsNode); } catch (_) { /* (no key: taken as unchanged) */ }
    const e = Q.env.get(camera);
    if (!e) Q.env.set(camera, { k: ek, at: -1 }); else if (ek !== null && e.k !== ek) { e.k = ek; e.at = Q.frame; }
    if (e && e.at === Q.frame) { NOWAIT_STATS.env++; return asIs(this, arguments); }
    const ro = this._objects.get(object, material, scene, camera, lightsNode, this._currentRenderContext, clippingContext, passId);
    if (ro._nodeBuilderState || N.get(ro).nodeBuilderState !== undefined || N.nodeBuilderCache.has(N.getForRenderCacheKey(ro))) {
      // (drawn: its count of times put off starts again, so a thing whose shader changes now and then, a person going in and
      // out of the GPU skinning pool, is put off each time, not drawn as three does from its thirteenth change on)
      if (Q.counted.size && Q.counted.has(object)) { const m = PUT_OFF.get(object); m?.delete(camera); if (!m?.size) { PUT_OFF.delete(object); Q.counted.delete(object); } }
      return direct.apply(this, arguments);
    }
    const bundle = () => { if (this._currentRenderBundle !== null) this.backend.get(this._currentRenderBundle).version = -1; };   // (a still scenery bundle is recorded again once it's there)
    if (Q.has.has(ro)) return bundle();
    // (a thing put off again and again, its shader's key changing from frame to frame: drawn as three does, or it never shows)
    // (counted for each camera that draws it: its shadow's key changing every frame while the thing itself draws still has it drawn)
    let m = PUT_OFF.get(object); if (!m) PUT_OFF.set(object, m = new Map());
    const k = (m.get(camera) || 0) + 1; m.set(camera, k); Q.counted.add(object);
    if (k > NOWAIT.most) return asIs(this, arguments);
    // the shader's text is not written yet: queued, as three's compileAsync queues a thing, and left out of this frame
    bundle();
    Q.has.add(ro); NOWAIT_STATS.texts++; name(ro, 'text');
    Q.list.push(watch({ ro, object, top: top(object), material, side: material.side, scene, camera, lightsNode, group, clippingContext, passId, renderContext: this._currentRenderContext,
      state: { useFrameBufferTarget: true, renderTarget: this.getRenderTarget(), mrt: this.getMRT(), renderContext: this._currentRenderContext }, frame: take(this, lightsNode) }));
    drain(r);
  };
}
// how many times a thing was put off for each camera since it was last drawn (NOWAIT.most at most)
const PUT_OFF = new WeakMap();
const top = o => { while (o.parent) o = o.parent; return o; };
const glLook = m => (Array.isArray(m) ? m.some(glLook) : !!m && m.isShaderMaterial === true && !m.isNodeMaterial);

// (names for the frame lab and tests: what was put off, a few dozen kept)
function name(ro, why) {
  const m = ro.material, o = ro.object, L = NOWAIT_STATS.names;
  L.push(`${m?.name || m?.type || '?'} on ${o?.name || o?.type || '?'} (${why})`); if (L.length > 48) L.shift();
}

// the view's frame is over: what it asked for in the background is counted, and its queue gets its turn
/** hd3d.js, after the view's frame: the pipelines it asked for in the background are let go of (three keeps them). */
export function noWaitFrame(r) {
  const Q = r?.gsNoWait; if (!Q) return;
  Q.frame++;
  if (Q.sink?.length) {
    const s = Q.sink; Q.sink = null;
    r.gsBuilding = (r.gsBuilding || 0) + 1; NOWAIT_STATS.frames++; Q.inflight += s.length;
    Promise.all(s.map(p => p.then(one, one))).then(done, done);
    function one() { Q.inflight--; Q.done++; }
    function done() { r.gsBuilding--; }
  } else Q.sink = null;
}

const nextFrame = () => new Promise(res => { if (typeof requestAnimationFrame === 'function' && !(typeof document !== 'undefined' && document.hidden)) requestAnimationFrame(() => setTimeout(res, 0)); else setTimeout(res, 0); });

// The queued builds, one after another, on the renderer's one build queue (hd3d.js compileGPU keeps its place there
// too). Each is three's compileAsync's work for one thing, with the state the frame had when it asked put back on.
function drain(r) {
  const Q = r.gsNoWait;
  if (Q.running) return;
  Q.running = true;
  r.gsBuilding = (r.gsBuilding || 0) + 1;
  const run = async () => {
    let t0 = performance.now();
    const pipes = new Set();
    const yieldNow = async () => {
      if (performance.now() - t0 < NOWAIT.ms) return;
      const st = r._precompilationState; finish(r);
      await nextFrame(); t0 = performance.now();
      if (r._isDeviceLost) throw LOST;
      back(r, st); begin(r, st);
    };
    while (Q.list.length) {
      const it = Q.list.shift();
      if (r._isDeviceLost) { Q.list.length = 0; Q.has.clear(); break; }
      // (a thing taken out of what it was drawn in meanwhile: nothing to build for)
      // (or its material changed since: a kit's WebGL look swapped back in when the view left WebGPU, hd3d.js gpuSwap)
      // (or it, its look, its shape or its render object was thrown away meanwhile: a game's reset() under the loading
      // screen, three making the render object again; built, its bindings wrote to buffers already freed and the chip
      // refused the frame: Long Shadow's round never started)
      if (it.gone || top(it.object) !== it.top || glLook(it.object.material) || glLook(it.material)) { NOWAIT_STATS.dropped++; it.unwatch(); Q.has.delete(it.ro); Q.counted.delete(it.object); continue; }
      if (performance.now() - t0 >= NOWAIT.ms) { await nextFrame(); t0 = performance.now(); }
      const st = it.state;
      st.item = it; st.materialSide = null; back(r, st);
      const promises = [], p0 = r.info.memory.programs;
      begin(r, st);
      let ok = false;
      try {
        // (the frame's own render object, as the frame keyed it: looked up again here, with the renderer between frames, three
        // can find its key changed (the frame's clipping, its context), throw it away and build another one under another key)
        const ro = it.ro;
        ro.drawRange = it.object.geometry.drawRange; ro.group = it.group;
        await r._nodes.getForRenderAsync(ro, yieldNow);
        if (it.gone) { NOWAIT_STATS.dropped++; continue; }   // (thrown away while its text was written: nothing to make a pipeline for)
        r._nodes.updateBefore(ro);
        r._geometries.updateForRender(ro);
        r._nodes.updateForRender(ro);
        r._bindings.updateForRender(ro);
        r._pipelines.getForRender(ro, promises);
        r._nodes.updateAfter(ro);
        ok = true;
      } catch (e) {
        if (e !== LOST) { NOWAIT_STATS.failed++; console.warn('3D: a shader put off from a frame failed to build', e); }
      } finally { if (r._precompilationState) finish(r); Q.has.delete(it.ro); it.unwatch(); NOWAIT_STATS.programs += Math.max(0, r.info.memory.programs - p0); }
      if (ok) NOWAIT_STATS.built++;
      if (!promises.length) Q.done++;
      for (const p of promises) { const end = () => { pipes.delete(q); Q.done++; }, q = p.then(end, end); pipes.add(q); }
      // (a few pipelines at once at most, as compileAsync does)
      while (pipes.size >= 8) await Promise.race(pipes);
    }
    await Promise.all(pipes);
  };
  const p = (r.gsCompiling || Promise.resolve()).then(run).catch(() => {}).finally(() => {
    Q.running = false; r.gsBuilding--;
    if (Q.list.length) drain(r);
  });
  r.gsCompiling = p;
}
const LOST = new Error('device lost');
// a queued thing is marked gone when it, its material or its geometry is disposed, or three disposes the frame's render
// object for it (a material changed under it, its lights node freed); unwatch() takes the marks off once it is built or dropped
function watch(it) {
  const gone = () => { it.gone = true; }, ro = it.ro, geo = ro.geometry, own = Object.hasOwn(ro, 'dispose'), d = ro.dispose;
  for (const t of [it.object, it.material, geo]) t?.addEventListener?.('dispose', gone);
  ro.dispose = function () { it.gone = true; return d.apply(this, arguments); };
  it.unwatch = () => {
    for (const t of [it.object, it.material, geo]) t?.removeEventListener?.('dispose', gone);
    if (own) ro.dispose = d; else delete ro.dispose;
    it.unwatch = () => {};
  };
  return it;
}
// What else of the renderer a shader's text is written from, as the frame had it: the scene pass sets its own context on
// the renderer while it draws (three's PassNode: the kit's ambient occlusion, reflections and lights read through it), and
// the frame's tone mapping, shadows and depth, and the lights the scene's lights node had for this draw (it is one node for
// the scene, its list set again for each render of it: by the time a build's turn comes, the last render's, which may not
// see the sun at all). Built between frames without them, the text came out for another pass
// (no shadow maps, no occlusion: the ground a third darker in the check).
const take = (r, ln) => ({ lights: ln?.getLights?.().slice() ?? null, contextNode: r.contextNode, toneMapping: r.toneMapping, outputColorSpace: r.outputColorSpace, shadows: r.shadowMap.enabled, depth: r.depth, stencil: r.stencil });
function put(r, f, ln) { if (ln && f.lights) ln.setLights(f.lights); r.contextNode = f.contextNode; r.toneMapping = f.toneMapping; r.outputColorSpace = f.outputColorSpace; r.shadowMap.enabled = f.shadows; r.depth = f.depth; r.stencil = f.stencil; }
function begin(r, st) { const ln = st.item.lightsNode; st.was = take(r, ln); put(r, st.item.frame, ln); r._beginPreCompile(st); }
function finish(r) { const st = r._precompilationState; r._finishPreCompile(); if (st?.was) { put(r, st.was, st.item?.lightsNode); st.was = null; } }
// what the renderer has now is what a build puts back when it stops or yields (as forPass does for the kit's own builds)
function back(r, st) { st.outputRenderTarget = r.getRenderTarget(); st.outputMRT = r.getMRT(); st.activeCubeFace = r.getActiveCubeFace(); st.activeMipmapLevel = r.getActiveMipmapLevel(); }
