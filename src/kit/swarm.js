// Swarms: thousands of simple creatures that flock (fish shoals, bats, bees, zombie hordes, starling
// murmurations), pulled towards and pushed away from points you set each frame, steering round
// obstacles. On phones with WebGPU (top-end ones) the moving is done on the graphics chip with a
// compute shader; everywhere else it runs here on the CPU with a spatial grid. Same rules, same
// numbers, and a game never needs to know which it got (swarm.gpu says).
//
//   const { Swarm } = gs.ai;
//   reset() { fish = new Swarm({ count: 2000, w: W, h: H, speed: 70 }); }
//   update(dt) {
//     fish.pull(food.x, food.y, { strength: 1 });           // up to 8 pulls a frame (negative pushes away)
//     fish.pull(shark.x, shark.y, { strength: -4, radius: 90 });
//     fish.update(dt);
//     for (const i of fish.near(shark.x, shark.y, 12)) { fish.kill(i); score++; }
//   }
//   draw(c) { for (let i = 0; i < fish.count; i++) if (fish.alive[i]) dot(fish.x[i], fish.y[i], fish.angle(i)); }
//
// Options: count (up to 8192; Swarm.max() says about how many this phone moves smoothly), w, h (the area), speed, sight (how far each one sees its neighbours,
// 24), separate / align / cohere (the three flocking urges, 1.6 / 1 / .8), wander (.3), edges
// ('wrap' or 'bounce'), seed, gpu (false keeps it on the CPU). obstacle(x, y, r) adds a round
// obstacle (up to 16). On the GPU the positions you read are one or two frames old, which nobody sees.
// Not lazy: it starts on the CPU at once and moves to the GPU when that's ready.
import { timed } from './prof.js';
import { computeDevice } from './gpu.js';
import { phoneClass } from './speed.js';
import { own } from './cleanup.js';

const MAX = 8192, PULLS = 8, ROCKS = 16, P_FLOATS = 16 + PULLS * 4 + ROCKS * 4;

function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (i, f) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(f, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

let gpuOff = false;
try { gpuOff = /[?&]nogpu\b/.test(globalThis.location?.search || ''); } catch (_) { /* no location */ }

export class Swarm {
  constructor({ count = 500, w = 360, h = 640, speed = 60, sight = 24, separate = 1.6, align = 1, cohere = .8, wander = .3, edges = 'wrap', seed = 1, gpu = 'auto' } = {}) {
    this.count = Math.max(1, Math.min(MAX, count | 0));
    Object.assign(this, { w, h, speed, sight, separate, align, cohere, wander, edges });
    const n = this.count, r = rng(seed);
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.alive = new Uint8Array(n).fill(1); this.living = n;
    for (let i = 0; i < n; i++) { this.x[i] = r() * w; this.y[i] = r() * h; const a = r() * Math.PI * 2; this.vx[i] = Math.cos(a) * speed * .5; this.vy[i] = Math.sin(a) * speed * .5; }
    this.pulls = []; this.rocks = []; this.frame = 0; this.gpu = false;
    this.cell = null;
    own(this);   // GPU buffers are freed when the card leaves the feed
    // the GPU: on phones that can (top-end with WebGPU), unless the game or ?nogpu says no
    const want = gpu === true || (gpu === 'auto' && !gpuOff && this.count >= 600 && phoneClass() === 'top');
    if (want) this.ready = startGPU(this).catch(() => false); else this.ready = Promise.resolve(false);
  }

  /** Pulls the swarm towards (x, y) this frame (strength < 0 pushes it away). radius: only those nearer than this feel it (0 = all). */
  pull(x, y, { strength = 1, radius = 0 } = {}) { if (this.pulls.length < PULLS) this.pulls.push(x, y, strength, radius); return this; }
  /** A round obstacle they steer round (stays until clearObstacles()). */
  obstacle(x, y, r) { if (this.rocks.length < ROCKS * 4) this.rocks.push(x, y, r, 0); return this; }
  clearObstacles() { this.rocks.length = 0; return this; }
  /** Removes one (it stops and isn't returned by near()). */
  kill(i) { if (this.alive[i]) { this.alive[i] = 0; this.living--; this._gpuAlive?.(i, 0); } return this; }
  /** Brings one back at (x, y). */
  revive(i, x, y) { if (!this.alive[i]) this.living++; this.alive[i] = 1; this.x[i] = x; this.y[i] = y; this.vx[i] = 0; this.vy[i] = 0; this._gpuPlace?.(i); this._gpuAlive?.(i, 1); return this; }
  /** Moves one to (x, y). */
  place(i, x, y) { this.x[i] = x; this.y[i] = y; this._gpuPlace?.(i); return this; }
  /** The way one is heading (radians). */
  angle(i) { return Math.atan2(this.vy[i], this.vx[i]); }
  /** The living ones within r of (x, y), as indices. */
  near(x, y, r) {
    const out = [], r2 = r * r;
    for (let i = 0; i < this.count; i++) if (this.alive[i]) { const dx = this.x[i] - x, dy = this.y[i] - y; if (dx * dx + dy * dy <= r2) out.push(i); }
    return out;
  }
  /** How much they're heading the same way, 0 (all over) to 1 (all one way). */
  order() {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < this.count; i++) if (this.alive[i]) { const s = Math.hypot(this.vx[i], this.vy[i]) || 1; sx += this.vx[i] / s; sy += this.vy[i] / s; n++; }
    return n ? Math.hypot(sx, sy) / n : 0;
  }

  /** Moves everyone dt seconds. Call once a frame, after pull(). */
  update(dt) {
    if (!(dt > 0)) { this.pulls.length = 0; return this; }
    dt = Math.min(dt, 1 / 20);
    const P = this._params(dt);
    if (this.gpu) this._gpuStep(P); else step(this, P);
    this.pulls.length = 0; this.frame++;
    return this;
  }
  _params(dt) {
    const p = this._P ||= new Float32Array(P_FLOATS);
    p.set([dt, this.speed, this.sight, this.separate, this.align, this.cohere, this.wander, this.edges === 'bounce' ? 1 : 0,
      this.w, this.h, this.pulls.length / 4, this.rocks.length / 4, this.frame, this.count, 0, 0]);
    p.fill(0, 16);
    p.set(this.pulls, 16); p.set(this.rocks, 16 + PULLS * 4);
    return p;
  }
  /** Resolves when the positions you can read have caught up with the last update (tests; games needn't). */
  sync() { return Promise.resolve(this._reading); }
  /** About how many this phone moves smoothly: 8192 where the graphics chip will do it, 2000 elsewhere. */
  static max() { return !gpuOff && phoneClass() === 'top' && !!globalThis.navigator?.gpu ? 8192 : 2000; }
  /** Lets go of the GPU buffers (the app calls it when the round ends; a game needn't). */
  dispose() { this.disposed = true; this._gpuFree?.(); this.gpu = false; }
  free() { this.dispose(); }
}

// ---------------------------------------------------------------- the CPU version (spatial grid)
// The same rules as the shader below: a neighbour within `sight` adds to alignment and cohesion, and
// within half of it pushes away (more the closer it is); then pulls, obstacles, a little wander, a
// speed limit, and the edges.
function step(s, P) {
  const dt = P[0], speed = P[1], sight = P[2], sepW = P[3], aliW = P[4], cohW = P[5], wanW = P[6], bounce = P[7] > .5;
  const W = P[8], H = P[9], np = P[10], nr = P[11], frame = P[12];
  const n = s.count, X = s.x, Y = s.y, VX = s.vx, VY = s.vy, A = s.alive;
  const cs = Math.max(4, sight), gw = Math.max(1, Math.ceil(W / cs)), gh = Math.max(1, Math.ceil(H / cs)), cells = gw * gh;
  let G = s.cell;
  if (!G || G.cells !== cells || G.n !== n) G = s.cell = { cells, n, head: new Int32Array(cells + 1), fill: new Int32Array(cells), list: new Int32Array(n), at: new Int32Array(n), nx: new Float32Array(n), ny: new Float32Array(n), nvx: new Float32Array(n), nvy: new Float32Array(n) };
  const { head, fill, list, at } = G;
  head.fill(0);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(gw - 1, Math.max(0, (X[i] / cs) | 0)), cy = Math.min(gh - 1, Math.max(0, (Y[i] / cs) | 0));
    at[i] = cy * gw + cx; if (A[i]) head[at[i] + 1]++;
  }
  for (let c = 0; c < cells; c++) { head[c + 1] += head[c]; fill[c] = head[c]; }
  for (let i = 0; i < n; i++) if (A[i]) list[fill[at[i]]++] = i;
  const s2 = sight * sight, near2 = s2 * .25, wrap = !bounce, look = new Int32Array(9);
  const toMid = cohW * speed / sight, push = sepW * speed * sight * .5, low = speed * .3;
  for (let i = 0; i < n; i++) {
    const x = X[i], y = Y[i];
    let vx = VX[i], vy = VY[i];
    if (!A[i]) { G.nx[i] = x; G.ny[i] = y; G.nvx[i] = 0; G.nvy[i] = 0; continue; }
    // the cells round this one (each once, even on a tiny wrapped grid)
    const gx = at[i] % gw, gy = (at[i] / gw) | 0;
    let nl = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      let qx = gx + ox, qy = gy + oy;
      if (wrap) { qx = (qx + gw) % gw; qy = (qy + gh) % gh; } else if (qx < 0 || qy < 0 || qx >= gw || qy >= gh) continue;
      const c = qy * gw + qx; let dup = false;
      for (let m = 0; m < nl; m++) if (look[m] === c) { dup = true; break; }
      if (!dup) look[nl++] = c;
    }
    let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, k = 0;
    for (let q = 0; q < nl; q++) {
      const c = look[q];
      for (let m = head[c]; m < head[c + 1]; m++) {
        const j = list[m]; if (j === i) continue;
        let dx = X[j] - x, dy = Y[j] - y;
        if (wrap) { dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H); }
        const d2 = dx * dx + dy * dy;
        if (d2 > s2) continue;
        ax += VX[j]; ay += VY[j]; cx += dx; cy += dy; k++;
        if (d2 < near2 && d2 > 1e-6) { sx -= dx / d2; sy -= dy / d2; }
      }
    }
    let fx = 0, fy = 0;
    if (k > 0) { fx += (ax / k - vx) * aliW + cx / k * toMid + sx * push; fy += (ay / k - vy) * aliW + cy / k * toMid + sy * push; }
    for (let p = 0; p < np; p++) {
      const o = 16 + p * 4, dx = P[o] - x, dy = P[o + 1] - y, str = P[o + 2], rad = P[o + 3], d = Math.sqrt(dx * dx + dy * dy) + 1e-3;
      if (rad > 0 && d > rad) continue;
      const f = str * speed * (rad > 0 ? 1 - d / rad : 1) / d; fx += dx * f; fy += dy * f;
    }
    for (let r = 0; r < nr; r++) {
      const o = 16 + PULLS * 4 + r * 4, dx = x - P[o], dy = y - P[o + 1], d = Math.sqrt(dx * dx + dy * dy) + 1e-3, edge = P[o + 2] + sight * .75;
      if (d < edge) { const f = (edge - d) / sight * 4 * speed / d; fx += dx * f; fy += dy * f; }
    }
    const a = (hash(i, frame) - .5) * 6.2832; fx += Math.cos(a) * wanW * speed; fy += Math.sin(a) * wanW * speed;
    vx += fx * dt; vy += fy * dt;
    const v = Math.sqrt(vx * vx + vy * vy);
    if (v > speed) { vx *= speed / v; vy *= speed / v; } else if (v < low && v > 1e-6) { vx *= low / v; vy *= low / v; }
    let nx = x + vx * dt, ny = y + vy * dt;
    if (bounce) { if (nx < 0) { nx = -nx; vx = Math.abs(vx); } else if (nx > W) { nx = 2 * W - nx; vx = -Math.abs(vx); } if (ny < 0) { ny = -ny; vy = Math.abs(vy); } else if (ny > H) { ny = 2 * H - ny; vy = -Math.abs(vy); } }
    else { nx -= W * Math.floor(nx / W); ny -= H * Math.floor(ny / H); }
    G.nx[i] = nx; G.ny[i] = ny; G.nvx[i] = vx; G.nvy[i] = vy;
  }
  X.set(G.nx); Y.set(G.ny); VX.set(G.nvx); VY.set(G.nvy);
}

// ---------------------------------------------------------------- the GPU version (WebGPU compute)
// Each creature looks at every other one, 256 at a time through workgroup memory: simple, and on a
// phone's graphics chip faster than the CPU grid from about a thousand creatures up.
const WGSL = /* wgsl */`
struct Params { a: vec4f, b: vec4f, c: vec4f, d: vec4f, pulls: array<vec4f, ${PULLS}>, rocks: array<vec4f, ${ROCKS}> };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var<storage, read> alive: array<u32>;
var<workgroup> tile: array<vec4f, 256>;
var<workgroup> tileAlive: array<u32, 256>;
fn hash(i: u32, f: u32) -> f32 {
  var h = ((i ^ 0x9e3779b9u) * 0x85ebca6bu) ^ (f * 0xc2b2ae35u);
  h = h ^ (h >> 13u); h = h * 0x27d4eb2du; h = h ^ (h >> 15u);
  return f32(h) / 4294967296.0;
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32) {
  let dt = P.a.x; let speed = P.a.y; let sight = P.a.z; let sepW = P.a.w;
  let aliW = P.b.x; let cohW = P.b.y; let wanW = P.b.z; let bounce = P.b.w > .5;
  let W = P.c.x; let H = P.c.y; let np = u32(P.c.z); let nr = u32(P.c.w);
  let frame = u32(P.d.x); let n = u32(P.d.y);
  let i = gid.x;
  var me = vec4f(0.0); var live = 0u;
  if (i < n) { me = src[i]; live = alive[i]; }
  let s2 = sight * sight; let near2 = s2 * .25;
  var al = vec2f(0.0); var co = vec2f(0.0); var se = vec2f(0.0); var k = 0.0;
  for (var t = 0u; t < n; t = t + 256u) {
    let j0 = t + li;
    if (j0 < n) { tile[li] = src[j0]; tileAlive[li] = alive[j0]; } else { tileAlive[li] = 0u; }
    workgroupBarrier();
    if (live == 1u) {
      for (var m = 0u; m < 256u; m = m + 1u) {
        let j = t + m;
        if (j == i || tileAlive[m] == 0u) { continue; }
        let o = tile[m];
        var d = o.xy - me.xy;
        if (!bounce) { d = d - vec2f(W, H) * round(d / vec2f(W, H)); }
        let d2 = dot(d, d);
        if (d2 > s2) { continue; }
        al += o.zw; co += d; k += 1.0;
        if (d2 < near2 && d2 > 1e-6) { se -= d / d2; }
      }
    }
    workgroupBarrier();
  }
  if (i >= n) { return; }
  if (live == 0u) { dst[i] = vec4f(me.xy, 0.0, 0.0); return; }
  var f = vec2f(0.0);
  if (k > 0.0) {
    f += (al / k - me.zw) * aliW;
    f += co / k * cohW * speed / sight;
    f += se * sepW * speed * sight * .5;
  }
  for (var p = 0u; p < np; p = p + 1u) {
    let q = P.pulls[p]; let dd = q.xy - me.xy; let d = length(dd) + 1e-3;
    if (q.w > 0.0 && d > q.w) { continue; }
    var fall = 1.0; if (q.w > 0.0) { fall = 1.0 - d / q.w; }
    f += dd / d * q.z * speed * fall;
  }
  for (var r = 0u; r < nr; r = r + 1u) {
    let q = P.rocks[r]; let dd = me.xy - q.xy; let d = length(dd) + 1e-3; let edge = q.z + sight * .75;
    if (d < edge) { f += dd / d * (edge - d) / sight * 4.0 * speed; }
  }
  let a = (hash(i, frame) - .5) * 6.2832; f += vec2f(cos(a), sin(a)) * wanW * speed;
  var v = me.zw + f * dt; let vl = length(v);
  if (vl > speed) { v *= speed / vl; } else if (vl < speed * .3 && vl > 1e-6) { v *= speed * .3 / vl; }
  var x = me.xy + v * dt;
  if (bounce) {
    if (x.x < 0.0) { x.x = -x.x; v.x = abs(v.x); } else if (x.x > W) { x.x = 2.0 * W - x.x; v.x = -abs(v.x); }
    if (x.y < 0.0) { x.y = -x.y; v.y = abs(v.y); } else if (x.y > H) { x.y = 2.0 * H - x.y; v.y = -abs(v.y); }
  } else { x = x - vec2f(W, H) * floor(x / vec2f(W, H)); }
  dst[i] = vec4f(x, v);
}`;

async function startGPU(s) {
  const dev = await computeDevice();
  if (!dev || s.disposed) return false;
  const n = s.count, U = GPUBufferUsage, bytes = n * 16;
  const mod = dev.createShaderModule({ code: WGSL });
  const pipe = await dev.createComputePipelineAsync({ layout: 'auto', compute: { module: mod, entryPoint: 'main' } });
  const params = dev.createBuffer({ size: P_FLOATS * 4, usage: U.UNIFORM | U.COPY_DST });
  const bufs = [0, 1].map(() => dev.createBuffer({ size: bytes, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC }));
  const alive = dev.createBuffer({ size: n * 4, usage: U.STORAGE | U.COPY_DST });
  const reads = [0, 1].map(() => ({ buf: dev.createBuffer({ size: bytes, usage: U.MAP_READ | U.COPY_DST }), busy: false }));
  const groups = [0, 1].map(k => dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
    { binding: 0, resource: { buffer: params } }, { binding: 1, resource: { buffer: bufs[k] } },
    { binding: 2, resource: { buffer: bufs[1 - k] } }, { binding: 3, resource: { buffer: alive } }] }));
  // hand over: what the CPU has now becomes the GPU's starting state
  const state = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) state.set([s.x[i], s.y[i], s.vx[i], s.vy[i]], i * 4);
  dev.queue.writeBuffer(bufs[0], 0, state);
  dev.queue.writeBuffer(alive, 0, Uint32Array.from(s.alive));
  let cur = 0, lost = false, pending = null, skipped = 0, since = s.frame;
  dev.lost?.then(() => { lost = true; });
  const one = new Float32Array(4), flag = new Uint32Array(1);
  s._gpuPlace = i => { pending ||= new Map(); pending.set(i, true); };
  s._gpuAlive = (i, v) => { flag[0] = v; dev.queue.writeBuffer(alive, i * 4, flag); };
  s._gpuFree = () => { s.disposed = true; for (const b of [params, alive, ...bufs, ...reads.map(r => r.buf)]) try { b.destroy(); } catch (_) {} s._gpuPlace = s._gpuAlive = s._gpuFree = null; };
  s._gpuStep = P => {
    if (lost) { s.gpu = false; s._gpuFree(); return step(s, P); }   // the GPU went away: carry on here
    // can't keep up (both read backs still waiting): skip this step; if that keeps happening the
    // graphics chip is too slow for this many, so carry on here on the CPU from the last positions
    if (reads.every(r => r.busy)) {
      if (++skipped > 20 && s.frame - since < 90) { s.gpu = false; s.slowGPU = true; s._gpuFree(); return step(s, P); }
      if (s.frame - since >= 90) { since = s.frame; skipped = 0; }
      return;
    }
    if (pending) { for (const i of pending.keys()) { one.set([s.x[i], s.y[i], s.vx[i], s.vy[i]]); dev.queue.writeBuffer(bufs[cur], i * 16, one); } pending = null; }
    dev.queue.writeBuffer(params, 0, P);
    const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
    pass.setPipeline(pipe); pass.setBindGroup(0, groups[cur]); pass.dispatchWorkgroups(Math.ceil(n / 256)); pass.end();
    cur = 1 - cur;
    const rd = reads.find(r => !r.busy);
    if (rd) enc.copyBufferToBuffer(bufs[cur], 0, rd.buf, 0, bytes);
    dev.queue.submit([enc.finish()]);
    if (rd) {
      rd.busy = true;
      s._reading = rd.buf.mapAsync(GPUMapMode.READ).then(() => {
        if (s.disposed) return;
        const a = new Float32Array(rd.buf.getMappedRange());
        for (let i = 0; i < n; i++) { if (pending?.has(i)) continue; const o = i * 4; s.x[i] = a[o]; s.y[i] = a[o + 1]; s.vx[i] = a[o + 2]; s.vy[i] = a[o + 3]; }
        rd.buf.unmap(); rd.busy = false;
      }, () => { rd.busy = false; });
    }
  };
  s.gpu = true;
  return true;
}

// per-frame work, timed while the frame lab is open (prof.js)
timed(Swarm.prototype, 'update', 'swarm');
