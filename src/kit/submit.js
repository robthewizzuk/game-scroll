// One submit a frame (WebGPU). three makes a command encoder for every pass and every compute call and hands
// each to the chip by itself (queue.submit): 25 to 40 submits a frame in a busy scene, each a trip through the
// browser's graphics process to the driver. Here the device's queue holds what three submits and sends it in one
// go at the end of the frame, in the same order.
//
// What must not change is what each pass sees. WebGPU does an upload (queue.writeBuffer, writeTexture) at once,
// ahead of anything not yet submitted, so an upload to a buffer or picture that a held pass reads or writes would
// reach that pass too early: the held passes are sent first (a "flush"), then the upload goes. The same before a
// buffer is read back (mapAsync), before a buffer or picture a held pass uses is freed, and before the page asks
// when the chip is done. So each command encoder keeps a list of the buffers and pictures its passes use (through
// their bind groups, vertex and index buffers, indirect buffers, copies, render bundles and the pictures drawn
// into), each of those counts the held encoders that use it, and a count above zero is what asks for a flush.
// Uploads to things no held pass uses, which is most of them, go straight through.
//
// Whatever is still held when the frame's code ends is sent in a microtask, before the browser shows the frame;
// flushGPU() sends it now (gpu.js copyFrame: before the canvas is copied to a card).
//
// The chip starts on a pass when it is sent, not when the frame's code ends (measured: a heavy pass sent and then
// its own time again spent in code is done in 1.1 times the pass's time; the code first and the pass after, in 2
// times). So one send at the very end would leave the chip idle through the whole of the frame's code, and its
// work would only begin then: the frame comes out later by whatever the chip could have done meanwhile. The 3D
// view therefore sends what is held at the points where a lot of code is still to come (sendEarly): before the
// scene is drawn (skinning, compute, the kit's shadow maps), after a shadow map three draws inside the scene's
// pass, and at once when the scene's pass is encoded. The effects after it, encoded while the chip draws the scene,
// go together at the end: three or four sends a frame, and the chip is never idle while there is work for it.
// ONE_SUBMIT.early = false (HD.submitEarly): one send at the end, to compare.
//
// Sends put off past the refresh (deferSends: frame generation's 'early' pace, 30 → 60). A refresh's picture reaches the
// screen once all the work sent before the frame's code ended is done (one queue on the chip), so a real frame drawn on
// the same refresh as the picture shown holds that picture back until it is done too. With deferSends() the frame's
// passes from then on are sent in a task after the browser has handed the refresh's picture over: the picture shown
// (sent before) goes out on time and the real frame has that refresh and the next on the chip. What would have sent
// the held passes early keeps its place in the line instead: an upload to a buffer or picture a held pass uses is
// copied and done after those passes, a read back (mapAsync), onSubmittedWorkDone or a buffer freed waits for them, in
// the order the code asked. A picture copied from an image (copyExternalImageToTexture), popErrorScope and flushGPU()
// send everything at once, in order, as before. The next refresh's code sends what is still waiting first.
//
// The patches are on WebGPU's own prototypes (the passes and encoders are made new each frame); they only keep
// lists, and only a device given to holdSubmits() holds anything.

/** Tests and the frame lab: `on: false` submits each pass by itself, as three does. sent: real submits so far; held: command buffers that went with others; why: what asked for each early flush (trace: true also keeps the buffer's or picture's label). */
export const ONE_SUBMIT = { on: true, early: true, sent: 0, held: 0, why: {}, trace: false, names: {}, deferred: 0, waited: 0 };

let patched = false, states = [];

const note = (e, r) => { if (e && r && r.gsL !== e) { r.gsL = e; (e.gsR ||= []).push(r); } };
const name = r => r?.label || (r?.size ? 'a buffer of ' + r.size + ' bytes' : r?.width ? `a picture ${r.width}x${r.height} ${r.format}` : '?');
const texOf = v => v ? v.gsT || (typeof v.createView === 'function' ? v : null) : null;
const count = (cb, d) => {
  const R = cb.gsR, G = cb.gsG;
  if (R) for (let i = 0; i < R.length; i++) R[i].gsH = (R[i].gsH | 0) + d;
  if (G) for (let i = 0; i < G.length; i++) { const L = G[i].gsR; if (L) for (let k = 0; k < L.length; k++) L[k].gsH = (L[k].gsH | 0) + d; }
};

/** Starts keeping the lists (before a device makes its first bind group or picture view: gpu.js, before the renderer is made). */
export function watchSubmits() { patch(); }
function patch() {
  if (patched || typeof GPUCommandEncoder === 'undefined') return; patched = true;
  const wrap = (C, k, f) => { const P = C?.prototype, o = P?.[k]; if (typeof o !== 'function') return; P[k] = f(o); };
  // a picture's views say which picture they are of
  wrap(GPUTexture, 'createView', o => function (d) { const v = o.call(this, d); v.gsT = this; return v; });
  // a bind group's buffers and pictures, once, when it is made
  wrap(GPUDevice, 'createBindGroup', o => function (d) {
    const g = o.call(this, d), R = [];
    for (const e of d?.entries || []) { const x = e.resource, r = x && (x.buffer || texOf(x) || (typeof x.mapAsync === 'function' ? x : null)); if (r) R.push(r); }
    g.gsR = R; return g;
  });
  // an encoder's passes say which encoder they are of, and the pictures drawn into are noted
  wrap(GPUCommandEncoder, 'beginRenderPass', o => function (d) {
    const p = o.call(this, d); p.gsE = this;
    for (const a of d?.colorAttachments || []) if (a) { note(this, texOf(a.view)); if (a.resolveTarget) note(this, texOf(a.resolveTarget)); }
    if (d?.depthStencilAttachment) note(this, texOf(d.depthStencilAttachment.view));
    return p;
  });
  wrap(GPUCommandEncoder, 'beginComputePass', o => function (d) { const p = o.call(this, d); p.gsE = this; return p; });
  wrap(GPUCommandEncoder, 'copyBufferToBuffer', o => function () { for (let i = 0; i < arguments.length; i++) { const x = arguments[i]; if (x && typeof x === 'object') note(this, x); } return o.apply(this, arguments); });
  wrap(GPUCommandEncoder, 'copyBufferToTexture', o => function (s, d, z) { note(this, s?.buffer); note(this, d?.texture); return o.call(this, s, d, z); });
  wrap(GPUCommandEncoder, 'copyTextureToBuffer', o => function (s, d, z) { note(this, s?.texture); note(this, d?.buffer); return o.call(this, s, d, z); });
  wrap(GPUCommandEncoder, 'copyTextureToTexture', o => function (s, d, z) { note(this, s?.texture); note(this, d?.texture); return o.call(this, s, d, z); });
  wrap(GPUCommandEncoder, 'clearBuffer', o => function (b) { note(this, b); return o.apply(this, arguments); });
  wrap(GPUCommandEncoder, 'resolveQuerySet', o => function (q, f, n, b, at) { note(this, b); return o.call(this, q, f, n, b, at); });
  wrap(GPUCommandEncoder, 'finish', o => function (d) { const cb = o.call(this, d); cb.gsR = this.gsR; cb.gsG = this.gsG; return cb; });
  // what a pass uses: its bind groups (each noted once an encoder), its buffers, its bundles
  // (called a hundred times a frame: `arguments` passed on as it is, nothing made)
  const group = o => function (i, g) { const e = this.gsE; if (e && g && g.gsL !== e) { g.gsL = e; (e.gsG ||= []).push(g); } return arguments.length <= 2 ? o.call(this, i, g) : o.apply(this, arguments); };
  const first = o => function (b) { note(this.gsE, b); return o.apply(this, arguments); };
  for (const C of [GPURenderPassEncoder, GPUComputePassEncoder]) wrap(C, 'setBindGroup', group);
  wrap(GPURenderPassEncoder, 'setVertexBuffer', o => function (s, b) { note(this.gsE, b); return o.apply(this, arguments); });
  for (const k of ['setIndexBuffer', 'drawIndirect', 'drawIndexedIndirect', 'multiDrawIndirect', 'multiDrawIndexedIndirect']) wrap(GPURenderPassEncoder, k, first);
  wrap(GPUComputePassEncoder, 'dispatchWorkgroupsIndirect', first);
  wrap(GPURenderPassEncoder, 'executeBundles', o => function (L) { const e = this.gsE; if (e) for (const b of L) if (b && b.gsL !== e) { b.gsL = e; (e.gsG ||= []).push(b); } return o.call(this, L); });
  // a render bundle keeps the list of what it uses for the passes that run it (the encoder is its own "encoder")
  if (typeof GPURenderBundleEncoder !== 'undefined') {
    wrap(GPURenderBundleEncoder, 'setBindGroup', o => function (i, g) { if (g && g.gsL !== this) { g.gsL = this; (this.gsG ||= []).push(g); } return arguments.length <= 2 ? o.call(this, i, g) : o.apply(this, arguments); });
    wrap(GPURenderBundleEncoder, 'setVertexBuffer', o => function (s, b) { note(this, b); return o.apply(this, arguments); });
    for (const k of ['setIndexBuffer', 'drawIndirect', 'drawIndexedIndirect']) wrap(GPURenderBundleEncoder, k, o => function (b) { note(this, b); return o.apply(this, arguments); });
    wrap(GPURenderBundleEncoder, 'finish', o => function (d) {
      const b = o.call(this, d), R = this.gsR ? [...this.gsR] : [];
      for (const g of this.gsG || []) if (g.gsR) for (const r of g.gsR) R.push(r);
      b.gsR = R; return b;
    });
  }
  // what asks for a flush: a read back, or the end of a buffer or picture that held passes use (while sends are put
  // off past the refresh: they wait their turn instead)
  const hazard = (C, k, why, later) => wrap(C, k, o => function () { if (this.gsH > 0) { if (D && later) return later(o, this, arguments); flushFor(this, why); } return o.apply(this, arguments); });
  hazard(GPUBuffer, 'mapAsync', 'read back', waitFor); hazard(GPUBuffer, 'destroy', 'freed', doLater); hazard(GPUTexture, 'destroy', 'freed', doLater);
}

function flushFor(r, why) {
  if (ONE_SUBMIT.trace) { const k = why + ': ' + name(r); ONE_SUBMIT.names[k] = (ONE_SUBMIT.names[k] || 0) + 1; }
  if (D) runDeferred(why);
  for (const S of states) if (S.list.length) send(S, why);
}

/* ---------- sends put off past the refresh ---------- */
// D: { S, items }: items in order, each a list of command buffers to send or a call to make after them
let D = null;
// (the channel is made on first use: one made as the module loads keeps Node, which builds and checks the games, from ever exiting)
let ch = null, chFn = null;
const post = f => {
  if (typeof MessageChannel !== 'function') return void setTimeout(f, 0);
  if (!ch) { ch = new MessageChannel(); ch.port1.onmessage = () => { const g = chFn; chFn = null; g?.(); }; }
  chFn = f; ch.port2.postMessage(0);
};
// a call made after what is held now (its arguments as they are now)
function defer(fn) {
  const S = D.S; if (S.list.length) { D.items.push(S.list); S.list = []; }
  D.items.push(fn);
}
const doLater = (o, self, args) => { const a = [...args]; defer(() => o.apply(self, a)); };
// a promise that waits for the held passes before asking (mapAsync, onSubmittedWorkDone)
const waitFor = (o, self, args) => { const a = [...args]; return new Promise((res, rej) => defer(() => { try { o.apply(self, a).then(res, rej); } catch (e) { rej(e); } })); };
// the data of an upload as it is now (the caller may change its array before the upload is done)
const copyData = d => ArrayBuffer.isView(d) ? (d instanceof DataView ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice() : d.slice()) : d?.slice ? d.slice(0) : d;
/** Runs what was put off past the refresh, in order (the task after the refresh, or anything that needs it all sent now). */
function runDeferred(why = 'task') {
  const d = D; if (!d) return; D = null;
  const S = d.S; if (S.lost) return;
  if (why !== 'task') { ONE_SUBMIT.waited++; ONE_SUBMIT.why['deferred: ' + why] = (ONE_SUBMIT.why['deferred: ' + why] || 0) + 1; }
  const rest = S.list; S.list = [];
  for (const it of d.items) {
    if (typeof it === 'function') { try { it(); } catch (e) { console.warn('3D: a call put off past the refresh', e); } continue; }
    for (let i = 0; i < it.length; i++) count(it[i], -1);
    ONE_SUBMIT.sent++; ONE_SUBMIT.held += it.length - 1; S.submit(it);
  }
  if (rest.length) { S.list = rest; send(S, 'deferred'); }
}
/**
 * From now until the frame's code ends, what is sent to the chip goes after the browser hands this refresh's picture
 * over (see the top of this file). What is held now (the picture shown) is sent first, with this refresh. False where
 * nothing is held this way (one submit a frame off, or no device): then nothing changes.
 */
export function deferSends() {
  if (!ONE_SUBMIT.on) return false;
  const S = states.find(s => !s.lost); if (!S) return false;
  if (D) runDeferred('again');
  if (S.list.length) send(S, 'before deferring');
  D = { S, items: [] }; ONE_SUBMIT.deferred++;
  post(() => runDeferred('task'));
  return true;
}
/** Sends are put off past the refresh now (deferSends) and haven't gone yet. */
export const deferring = () => !!D;
function send(S, why) {
  const L = S.list; if (!L.length) return;
  S.list = [];
  for (let i = 0; i < L.length; i++) count(L[i], -1);
  ONE_SUBMIT.sent++; ONE_SUBMIT.held += L.length - 1; ONE_SUBMIT.why[why] = (ONE_SUBMIT.why[why] || 0) + 1;
  S.submit(L);
}

/**
 * The device's queue from now on holds what is submitted to it until the frame's code ends (or something needs it
 * sent sooner). Once a device; a device lost has what it held dropped with it.
 */
export function holdSubmits(dev) {
  const q = dev?.queue; if (!q || dev.gsHold || typeof GPUCommandEncoder === 'undefined') return;
  patch();
  const S = dev.gsHold = { dev, list: [], submit: q.submit.bind(q), due: false, stats: ONE_SUBMIT };
  states = states.filter(s => !s.lost); states.push(S);
  dev.lost?.then(() => { S.lost = true; S.list = []; if (D?.S === S) D = null; states = states.filter(s => s !== S); });
  // (while sends are put off past the refresh, the end of the frame's code leaves them for the task)
  const later = () => { S.due = false; if (D?.S !== S) send(S, 'frame'); };
  q.submit = function (bufs) {
    if (!ONE_SUBMIT.on || S.lost) { if (D?.S === S) runDeferred('off'); if (S.list.length) send(S, 'off'); ONE_SUBMIT.sent++; return S.submit(bufs); }
    for (const cb of bufs) { count(cb, 1); S.list.push(cb); }
    if (!S.due) { S.due = true; queueMicrotask(later); }
  };
  // (put off past the refresh: an upload a held pass is waiting on is copied and done after it, `wait` waits its turn;
  // the rest send everything now, in order)
  const before = (o, k, pick, why, wait) => { const f = o[k]; if (typeof f === 'function') o[k] = function (...a) {
    if (D?.S === S && (S.list.length || D.items.length)) {
      const r = pick ? pick(a) : null;
      if (!pick || r?.gsH > 0) {
        if (wait === 'data') { const b = [...a], i = k === 'writeBuffer' ? 2 : 1; b[i] = copyData(a[i]); defer(() => f.apply(this, b)); return; }
        if (wait) return waitFor(f, this, a);
        runDeferred(why);
      }
    }
    if (S.list.length) { const r = pick ? pick(a) : null; if (!pick || r?.gsH > 0) { if (ONE_SUBMIT.trace) { const n = why + ': ' + name(r); ONE_SUBMIT.names[n] = (ONE_SUBMIT.names[n] || 0) + 1; } send(S, why); } } return f.apply(this, a); }; };
  before(q, 'writeBuffer', a => a[0], 'upload', 'data');
  before(q, 'writeTexture', a => a[0]?.texture, 'picture upload', 'data');
  before(q, 'copyExternalImageToTexture', a => a[1]?.texture, 'picture upload');
  before(q, 'onSubmittedWorkDone', null, 'done', true);
  before(dev, 'popErrorScope', null, 'errors');
}

/** Sends what is held now (before the canvas is read: copied to a card, or looked at by a test). */
export function flushGPU(why = 'copy') { if (D) runDeferred(why); for (const S of states) if (S.list.length) send(S, why); }
/** Sends what is held now so the chip can start on it while the frame's code goes on (see the top of this file); nothing with ONE_SUBMIT.early off. */
// (not while sends are put off past the refresh: those go together after it)
export function sendEarly(why) { if (ONE_SUBMIT.early && !D) for (const S of states) if (S.list.length) send(S, why); }
