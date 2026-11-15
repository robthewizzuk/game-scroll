// Bounce light from traced rays (v.liveBounce = 'traced', WebGPU, the best phones, high and ultra): light that has hit
// the floor, the walls and the props and lights everything else, worked out all the time from rays sent through the
// same simplified copy of the level that ray traced reflections use (hd3d-gpu-trace.js's Tracer), so it follows a
// moving sun, a lamp switched on or a door opened, and walls off the screen and behind the camera count.
//
// Light is kept in a grid of probes (the same grid three.js's LightProbeGrid bakes once, v.bounce(), and every lit
// material already reads: nothing about the materials changes). Each frame a batch of the probes sends a few dozen
// rays each in every direction (turned a little each frame, so over the frames every direction is tried); what a ray
// hits is lit as a traced reflection's unseen hit is (the sun through a shadow ray, the sky's light, the nearest
// lamps, its own glow) plus the bounce light the grid already holds there, so light goes on bouncing frame after
// frame. A probe keeps a running average of what its rays found, as nine numbers a colour (second order spherical
// harmonics, what three.js's grid holds); then the grid's picture is written from those in one pass.
//   - a probe whose rays mostly meet the backs of things is inside something solid: it takes its neighbours' light
//     instead of its own darkness (light doesn't leak out of a wall, nor dark into the room);
//   - the sky's own light is the scene's environment's, as before: a ray that meets nothing adds no bounce light;
//   - a grid that follows the camera moves in whole steps, its probes keeping what they had found, and fades to
//     nothing at its edges, so there is no line where it ends.
// Measured against the reflections: a ray of this costs about what one of theirs does (one ray and one shadow ray);
// the default grid sends 6,144 a frame against up to 325,000 for reflections on a Fold at high quality.
// Kit use only (hd3d.js makes the grid and decides when; this file loads with the ray tracing part).
import { RenderTarget, HalfFloatType, FloatType, RGBAFormat, NearestFilter, NodeMaterial, QuadMesh, RendererUtils, Vector3, Matrix3 } from 'three/webgpu';
import { Fn, uniform, texture, textureStore, pmremTexture, vec3, vec4, ivec2, ivec3, int, float, If, Loop, select, screenCoordinate, instanceIndex, getShIrradianceAt, array, max, min, clamp, sqrt, cos, sin, smoothstep, abs, dot, mix } from 'three/tsl';
import { hitShader } from './hd3d-gpu-trace.js';
import { ORIGIN } from './origin.js';

const ORG = uniform(ORIGIN);
// HYST: the least share of a probe's light a batch of rays replaces (a new probe takes the first batches whole);
// INSIDE: the share of a probe's rays that meet the backs of things for it to be inside something; AGE_MAX: how
// many batches a probe counts before it settles at HYST
const HYST = .06, INSIDE = .3, AGE_MAX = 64, GOLDEN = 2.399963;
// CHANGE: how far a probe's brightness has to move (as a share of what it was and is) to be taken up at once
const CHANGE = [.3, .7];
const Y = d => [0.282095, d.y.mul(0.488603), d.z.mul(0.488603), d.x.mul(0.488603), d.x.mul(d.y).mul(1.092548), d.y.mul(d.z).mul(1.092548),
  d.z.mul(d.z).mul(3).sub(1).mul(0.315392), d.x.mul(d.z).mul(1.092548), d.x.mul(d.x).sub(d.y.mul(d.y)).mul(0.546274)].map(v => typeof v === 'number' ? float(v) : v);
let RS;
const Q = new QuadMesh();

export class TracedBounce {
  /** grid: the LightProbeGrid with a bounceAtlas picture; rays: a probe's rays a batch; batch: probes a frame. */
  constructor(r, grid, { rays = 64, batch = 96, follow = false } = {}) {
    const { x: nx, y: ny, z: nz } = grid.resolution, N = nx * ny * nz;
    Object.assign(this, { r, grid, nx, ny, nz, N, R: rays, B: Math.min(batch, N), follow });
    this.start = 0; this.cur = 0; this.gen = -1; this.trial = 0; this.failed = false; this.frames = 0; this.fresh = true;
    this.rot = new Matrix3(); this.shift = new Vector3();
    this.U = { min: uniform(new Vector3()), sp: uniform(new Vector3(1, 1, 1)), start: uniform(0, 'int'), rot: uniform(new Matrix3()), shift: uniform(new Vector3()), fresh: uniform(1) };
    const st = () => new RenderTarget(9, N, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, generateMipmaps: false });
    this.store = [st(), st()];
    this.rays = new RenderTarget(this.R, this.B, { type: HalfFloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, generateMipmaps: false });
    this.rays.gsPart = 'bounce light'; for (const t of this.store) t.gsPart = 'bounce light';   // (the frame lab's chip time by part)
    this.info = { probes: N, grid: [nx, ny, nz], rays: this.R * this.B, frames: 0, round: Math.ceil(N / this.B), inside: 0 };
  }
  // the shaders, made again when the tracer's lists on the chip are made anew
  build(tr) {
    this.disposeMats();
    const { nx, ny, nz, N, R, B, U } = this, L = tr.U, S = tr.S, pal = texture(tr.pal), envs = this.envs = [];
    const envAt = (dir, rough) => { const n = pmremTexture(this.envTex, dir, rough); envs.push(n); return n.rgb.mul(L.envI); };
    const shade = hitShader(L, S, pal, envAt, null);
    const prevN = texture(this.store[0].texture), raysN = texture(this.rays.texture);
    const cell = p => ivec3(p.mod(nx), p.div(nx * nz), p.div(nx).mod(nz));   // (x, y, z: the order three's bake keeps)
    const index = c => c.x.add(c.z.mul(nx)).add(c.y.mul(nx * nz));
    const fib = i => { const z = float(1).sub(float(i).mul(2).add(1).div(R)), s = sqrt(max(float(1).sub(z.mul(z)), 0)), a = float(i).mul(GOLDEN); return U.rot.mul(vec3(s.mul(cos(a)), z, s.mul(sin(a)))).normalize(); };
    // the bounce light the grid holds at a spot (the nearest probe's), for light that goes on bouncing
    const held = (Pw, n) => {
      const g = Pw.sub(U.min).div(U.sp).sub(.5), c = ivec3(clamp(g.add(.5).floor(), vec3(0), vec3(nx - 1, ny - 1, nz - 1))), p = index(c);
      const inGrid = g.x.greaterThan(-1).and(g.y.greaterThan(-1)).and(g.z.greaterThan(-1)).and(g.x.lessThan(nx)).and(g.y.lessThan(ny)).and(g.z.lessThan(nz));
      const sh = array(Array.from({ length: 9 }, (_, k) => prevN.load(ivec2(k, p)).rgb));
      return select(inGrid.and(prevN.load(ivec2(1, p)).a.lessThan(INSIDE)), getShIrradianceAt(n, sh).max(vec3(0)), vec3(0));
    };
    // a ray from each probe of this frame's batch: rgb what it brings (the light leaving what it hit), a how bright that is
    // without the light the grid already held (lit straight from the sun, the sky and the lamps), -1 where it met a back
    this.traceMat = new NodeMaterial(); this.traceMat.name = 'Bounce rays';
    this.traceMat.outputNode = Fn(() => {
      const i = int(screenCoordinate.x), b = int(screenCoordinate.y), p = U.start.add(b).mod(N), c = cell(p);
      const Pw = U.min.add(vec3(c).add(.5).mul(U.sp)).toVar(), rd = fib(i).toVar();
      const H = S.hit(Pw, rd, L.far).toVar(), hn = H.element(int(0)), hl = H.element(int(1)), did = H.element(int(2)).w.greaterThan(.5), back = H.element(int(3)).x.lessThan(0);
      const out = vec4(0).toVar();
      If(did.and(back), () => { out.assign(vec4(0, 0, 0, -1)); }).ElseIf(did, () => {
        const Q = Pw.add(rd.mul(hn.w)).toVar();
        // (shade takes a spot where the drawing has it; held one in the world's own numbers)
        const lit = shade(Q.sub(ORG), hn.xyz, hl.xyz, hl.w, rd).toVar();
        out.assign(vec4(lit.add(hl.xyz.mul(held(Q.add(hn.xyz.mul(.05)), hn.xyz)).mul(1 / Math.PI)), dot(lit, vec3(.2126, .7152, .0722))));
      });
      return out;
    })();
    // each probe's nine numbers: this batch's rays laid into what it had (moved with the grid)
    this.storeMat = new NodeMaterial(); this.storeMat.name = 'Bounce probes';
    this.storeMat.outputNode = Fn(() => {
      const k = int(screenCoordinate.x), p = int(screenCoordinate.y), c = cell(p), o = c.add(ivec3(U.shift)).toVar();
      const was = o.x.greaterThanEqual(0).and(o.y.greaterThanEqual(0)).and(o.z.greaterThanEqual(0)).and(o.x.lessThan(nx)).and(o.y.lessThan(ny)).and(o.z.lessThan(nz)).and(U.fresh.lessThan(.5));
      const po = index(clamp(o, ivec3(0), ivec3(nx - 1, ny - 1, nz - 1)));
      const old = select(was, prevN.load(ivec2(k, po)), vec4(0)).toVar(), age = select(was, prevN.load(ivec2(0, po)).a, float(0));
      const b = p.sub(U.start).add(N).mod(N), out = vec4(old).toVar();
      If(b.lessThan(B), () => {
        const sum = vec3(0).toVar(), lit = float(0).toVar(), lit2 = float(0).toVar(), backs = float(0).toVar();
        Loop(R, ({ i }) => {
          const s = raysN.load(ivec2(i, b)), l = max(s.a, 0);
          sum.addAssign(s.rgb.mul(array(Y(fib(i))).element(k))); lit.addAssign(l); lit2.addAssign(l.mul(l)); backs.addAssign(select(s.a.lessThan(-.5), float(1), float(0)));
        });
        // (light that has changed a lot since, a sun gone in or a lamp switched on, is taken up at once, not over many batches:
        // how bright the probe's rays found things lit straight from the sun, sky and lamps, against what it held, for all
        // nine of its numbers alike. The light bounced on from the grid is left out of it: that changes only as the grid does.
        // A change counts when it is a big share of the light and well outside what this batch's few rays could be off by:
        // taken up whole on every small wobble, the noise of a few rays a probe is let through, and a little of it bounces on)
        const now = lit.div(R), then = select(was, prevN.load(ivec2(2, po)).a, float(0)), off = sqrt(max(lit2.div(R).sub(now.mul(now)), 0).div(R));
        const d = abs(now.sub(then)), big = smoothstep(CHANGE[0], CHANGE[1], d.div(now.add(then).add(1e-4))), sure = smoothstep(2, 4, d.div(off.add(1e-4)));
        // (what it held is scaled as its straight light changed, and this batch counts for more: the light it holds that had
        // bounced on from the grid changed with it, and taken up only batch by batch through the grid, a room stayed lit for
        // seconds after the sun went in)
        const c = big.mul(sure), turn = mix(float(1), clamp(now.div(max(then, 1e-4)), 0, 4), c), a = max(max(float(1).div(age.add(1)), HYST), c.mul(.5));
        old.rgb.mulAssign(turn);
        // (the alphas: 0 how many batches it has counted, 1 the share of its rays that met backs, 2 that brightness)
        const w = select(k.equal(0), min(age.add(1), AGE_MAX), select(k.equal(1), mix(old.a, backs.div(R), a), select(k.equal(2), mix(then, now, a), float(0))));
        // (mix as a function: three's a.mix(b, t) is mix(b, t, a), the blend by a)
        out.assign(vec4(mix(old.rgb, sum.mul(4 * Math.PI / R), a), w));
      });
      return out;
    })();
    // the grid's picture, as three's grid packs it: seven parts of the nine colours, each nz slices with one more at each end
    this.atlas = [0, 1].map(s => {
      const from = texture(this.store[s].texture), at = this.grid.texture, total = nx * ny * 7 * (nz + 2), fade = this.follow ? 1 : 0;
      const k = Fn(() => {
        const id = int(instanceIndex);
        If(id.lessThan(total), () => {
          const x = id.mod(nx), y = id.div(nx).mod(ny), layer = id.div(nx * ny), t = layer.div(nz + 2), z = clamp(layer.mod(nz + 2).sub(1), 0, nz - 1);
          const c = ivec3(x, y, z), p = index(c), sh = Array.from({ length: 9 }, () => vec3(0).toVar());
          const take = (q, w) => { for (let k = 0; k < 9; k++) sh[k].addAssign(from.load(ivec2(k, q)).rgb.mul(w)); };
          If(from.load(ivec2(1, p)).a.lessThan(INSIDE), () => { take(p, float(1)); }).Else(() => {
            // inside something: its neighbours' light, those that are not
            const wsum = float(0).toVar();
            for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
              const n = c.add(ivec3(...d)), ok = n.x.greaterThanEqual(0).and(n.y.greaterThanEqual(0)).and(n.z.greaterThanEqual(0)).and(n.x.lessThan(nx)).and(n.y.lessThan(ny)).and(n.z.lessThan(nz));
              const q = index(clamp(n, ivec3(0), ivec3(nx - 1, ny - 1, nz - 1))), w = select(ok.and(from.load(ivec2(1, q)).a.lessThan(INSIDE)), float(1), float(0));
              take(q, w); wsum.addAssign(w);
            }
            for (let k = 0; k < 9; k++) sh[k].divAssign(max(wsum, 1));
          });
          // (a grid that follows the camera: nothing at its sides, so it fades out over its last step)
          const edge = fade ? select(x.equal(0).or(x.equal(nx - 1)).or(z.equal(0)).or(z.equal(nz - 1)), float(0), float(1)) : float(1);
          const pk = [vec4(sh[0], sh[1].x), vec4(sh[1].yz, sh[2].xy), vec4(sh[2].z, sh[3]), vec4(sh[4], sh[5].x), vec4(sh[5].yz, sh[6].xy), vec4(sh[6].z, sh[7]), vec4(sh[8], 0)];
          let v = pk[6]; for (let k = 5; k >= 0; k--) v = select(t.equal(k), pk[k], v);
          textureStore(at, ivec3(x, y, layer), v.mul(edge));
        });
      })().compute(total).setName('Bounce light grid');
      k.gsPart = 'bounce light';
      return k;
    });
    this.prevN = prevN; this.gen = tr.gen; this.trial = 6;
  }
  /**
   * Once a frame, after the tracer's frame (its lists and lights this frame's). box: where the grid stands in the
   * world ({ min: Vector3 }, its probes spaced by sp); shift: how many probes it moved by since last frame (whole
   * steps; null none); env: the scene's environment. Returns false when it can't run (the tracer not ready, failed).
   */
  frame(tr, min, sp, shift, env) {
    if (this.failed || !tr?.ready || !env) return false;
    this.envTex = env;
    if (this.gen !== tr.gen || !this.traceMat) this.build(tr);
    for (const n of this.envs) if (n.value !== env) n.value = env;
    const U = this.U, r = this.r;
    U.min.value.copy(min); U.sp.value.copy(sp); U.start.value = this.start; U.fresh.value = this.fresh ? 1 : 0;
    U.shift.value.copy(shift || this.shift.set(0, 0, 0));
    // the rays turned another way each frame (a random turn, so no direction is kept from frame to frame)
    U.rot.value.copy(randomTurn(this.rot));
    const from = this.store[this.cur], into = this.store[1 - this.cur];
    this.prevN.value = from.texture;
    const run = () => {
      RS = RendererUtils.resetRendererState(r, RS);
      try {
        r.setRenderTarget(this.rays); Q.material = this.traceMat; Q.name = 'Bounce rays'; Q.render(r);
        r.setRenderTarget(into); Q.material = this.storeMat; Q.name = 'Bounce probes'; Q.render(r);
      } finally { RendererUtils.restoreRendererState(r, RS); }
      r.compute(this.atlas[1 - this.cur]);
    };
    const dev = this.trial > 0 ? r.backend?.device : null;
    if (dev?.pushErrorScope) {
      this.trial--; dev.pushErrorScope('validation');
      try { run(); } finally { dev.popErrorScope().then(e => { if (e) this.fail(e); }, () => {}); }
    } else run();
    this.cur = 1 - this.cur; this.start = (this.start + this.B) % this.N; this.fresh = false;
    this.info.frames = ++this.frames;
    return true;
  }
  /** Everything found so far forgotten (a cut to another place). */
  forget() { this.fresh = true; }
  fail(e) { this.failed = true; console.warn('[gs] traced bounce light stopped: ' + (e?.message || e)); }
  disposeMats() { this.traceMat?.dispose(); this.storeMat?.dispose(); for (const c of this.atlas || []) c.dispose?.(); this.traceMat = this.storeMat = null; this.atlas = null; }
  dispose() { this.disposeMats(); for (const t of this.store) t.dispose(); this.rays.dispose(); this.failed = true; }
}

// a turn picked at random, the same for every direction (Shoemake's uniform quaternion)
function randomTurn(m) {
  const u1 = Math.random(), u2 = Math.random() * 2 * Math.PI, u3 = Math.random() * 2 * Math.PI, a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  const x = a * Math.sin(u2), y = a * Math.cos(u2), z = b * Math.sin(u3), w = b * Math.cos(u3);
  m.set(1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y));
  return m;
}
