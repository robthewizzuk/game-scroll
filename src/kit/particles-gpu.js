// GPU particles on WebGPU (hd3d.js GPUParticles): the same rules as its CPU path, run as a TSL compute
// pass over storage buffers that the sprites then read, so nothing comes back to the CPU. Bursts are
// written into a small uniform table each frame; each particle checks whether it falls in a burst's slice
// of the ring and starts itself there. Pulls (points that draw particles in, push them away or swirl them
// round, and may take them) are another small table, and a flow field (the air's or water's speed over a
// box, sampled by the CPU into 16 x 16 x 16 cells) one more buffer, both read by every particle each step,
// as Babylon.js 9's attractors and flow maps (the engines review, option 11).
import { Sprite, SpriteNodeMaterial, AdditiveBlending, NormalBlending, Vector3, Vector4 } from 'three/webgpu';
import {
  Fn, instancedArray, instanceIndex, uniform, uniformArray, Loop, If, int, float, vec3, vec4, uv, dot, mix, pow,
  sin, fract, max, min, select, smoothstep, length, cross, clamp, floor,
} from 'three/tsl';

import { particleMotion } from './framegen.js';

export const BURSTS = 16, ROWS = 7;   // bursts a frame, vec4 rows each (see hd3d.js GPUParticles.packBurst)
export const PULLS = 8, PULL_ROWS = 3, FLOW_N = 16;   // pulls at once and their rows; flow field cells along each side

// a random number 0..1 for particle i, burst seed s and channel k (the CPU path has its own; they needn't match)
const rnd = (i, s, k) => fract(sin(float(i).mul(12.9898).add(s.mul(78.233)).add(float(k).mul(37.719))).mul(43758.5453));

export function gpuSparks(p) {
  const N = p.max;
  const P = instancedArray(N, 'vec4'), V = instancedArray(N, 'vec4'), C = instancedArray(N, 'vec4'), E = instancedArray(N, 'vec4'), S = instancedArray(N, 'vec4');
  const rows = Array.from({ length: BURSTS * ROWS }, () => new Vector4());
  const B = uniformArray(rows, 'vec4'), nb = uniform(0, 'int');
  const dt = uniform(0), time = uniform(0), grav = uniform(p.gravity), drag = uniform(p.drag), floorY = uniform(-1e9), bounce = uniform(p.bounce);
  const turb = uniform(new Vector4()), wind = uniform(new Vector3());   // turbulence (strength, scale, speed), wind velocity
  // pulls: [x, y, z, strength], [swirl axis, swirl], [reach, take, 0, 0] each (hd3d.js GPUParticles.pull)
  const pullRows = Array.from({ length: PULLS * PULL_ROWS }, () => new Vector4()), A = uniformArray(pullRows, 'vec4'), na = uniform(0, 'int');
  // the flow field: FLOW_N³ cells of velocity over a box (min, size), taken up at flowK a second (0: none)
  const F = instancedArray(FLOW_N ** 3, 'vec4'), fMin = uniform(new Vector3()), fSize = uniform(new Vector3(1, 1, 1)), flowK = uniform(0);

  // start everything dead (age past life)
  const clear = Fn(() => { P.element(instanceIndex).assign(vec4(0, -1e5, 0, 1)); V.element(instanceIndex).assign(vec4(0, 0, 0, 0)); })().compute(N, [64]);

  const step = Fn(() => {
    const i = instanceIndex, pv = P.element(i).toVar(), vv = V.element(i).toVar();
    // new particles from this frame's bursts
    Loop({ start: int(0), end: nb, type: 'int' }, ({ i: b }) => {
      const r0 = B.element(b.mul(ROWS)), r1 = B.element(b.mul(ROWS).add(1)), r2 = B.element(b.mul(ROWS).add(2)), r3 = B.element(b.mul(ROWS).add(3));
      const r4 = B.element(b.mul(ROWS).add(4)), r5 = B.element(b.mul(ROWS).add(5)), r6 = B.element(b.mul(ROWS).add(6));
      const rel = int(i).sub(int(r0.x)).add(N).mod(N);
      If(rel.lessThan(int(r0.y)), () => {
        const s = r0.w;
        // a point in a ball: direction from two angles, radius by cube root for an even fill
        const u = rnd(i, s, 1).mul(2).sub(1), a = rnd(i, s, 2).mul(6.2831853), q = max(float(0), float(1).sub(u.mul(u))).sqrt();
        const dir = vec3(q.mul(a.cos()), u, q.mul(a.sin())), rr = pow(rnd(i, s, 3), float(1 / 3));
        const u2 = rnd(i, s, 4).mul(2).sub(1), a2 = rnd(i, s, 5).mul(6.2831853), q2 = max(float(0), float(1).sub(u2.mul(u2))).sqrt();
        const dir2 = vec3(q2.mul(a2.cos()), u2, q2.mul(a2.sin())), rv = pow(rnd(i, s, 6), float(1 / 3));
        const life = mix(r3.x, r3.y, rnd(i, s, 7));
        pv.assign(vec4(r1.xyz.add(dir.mul(r1.w.mul(rr))), 0));
        vv.assign(vec4(r2.xyz.add(dir2.mul(r2.w.mul(rv))), life));
        C.element(i).assign(r4);
        E.element(i).assign(r5);
        S.element(i).assign(vec4(r3.z, r3.w, r6.x, 0));
      });
    });
    // move the living
    If(pv.w.lessThan(vv.w), () => {
      const k = max(float(0), float(1).sub(drag.mul(dt)));
      const x = pv.xyz.mul(turb.y), tt = time.mul(turb.z);
      const curl = vec3(sin(x.y.add(tt)).add(sin(x.z.mul(1.7).sub(tt))), sin(x.z.add(tt.mul(1.3))).add(sin(x.x.mul(1.3).add(tt))), sin(x.x.add(tt.mul(.7))).add(sin(x.y.mul(1.9).sub(tt)))).mul(.5);
      const acc = vec3(0, grav.negate(), 0).add(curl.mul(turb.x)).toVar(), took = float(0).toVar();
      // pulls: strength at 1 m (steady closer in, falling as 1/d² beyond), fading out over the last third of the reach;
      // swirl turns them round the axis through the point; within take they are gone
      Loop({ start: int(0), end: na, type: 'int' }, ({ i: a }) => {
        const r0 = A.element(a.mul(PULL_ROWS)), r1 = A.element(a.mul(PULL_ROWS).add(1)), r2 = A.element(a.mul(PULL_ROWS).add(2));
        const d = r0.xyz.sub(pv.xyz), dl = max(length(d), 1e-4), n = d.div(dl);
        const fall = select(r2.x.greaterThan(0), float(1).sub(smoothstep(r2.x.mul(.67), r2.x, dl)), float(1)).div(max(dl.mul(dl), 1));
        acc.addAssign(n.mul(r0.w).add(cross(r1.xyz, n).mul(r1.w)).mul(fall));
        If(dl.lessThan(r2.y), () => { took.assign(1); });
      });
      const nv = vv.xyz.mul(k).add(acc.mul(dt)).toVar();
      // the flow field: inside its box (fading in over the outer tenth) the velocity is drawn towards the flow's there
      If(flowK.greaterThan(0), () => {
        const q = pv.xyz.sub(fMin).div(fSize).toConst();
        const edge = smoothstep(vec3(0), vec3(.1), q).mul(smoothstep(vec3(.9), vec3(1), q).oneMinus()).toConst(), w = edge.x.mul(edge.y).mul(edge.z).toConst();
        If(w.greaterThan(0), () => {
          const g = clamp(q, vec3(0), vec3(1)).mul(FLOW_N - 1).toConst(), b = clamp(floor(g), vec3(0), vec3(FLOW_N - 2)).toConst(), f = g.sub(b).toConst();
          const fv = vec3(0).toVar();
          for (let c = 0; c < 8; c++) {
            const o = [c & 1, (c >> 1) & 1, (c >> 2) & 1], cell = b.add(vec3(...o));
            const idx = int(cell.x).add(int(cell.y).mul(FLOW_N)).add(int(cell.z).mul(FLOW_N * FLOW_N));
            const wt = (o[0] ? f.x : f.x.oneMinus()).mul(o[1] ? f.y : f.y.oneMinus()).mul(o[2] ? f.z : f.z.oneMinus());
            fv.addAssign(F.element(idx).xyz.mul(wt));
          }
          nv.assign(mix(nv, fv, min(flowK.mul(dt), 1).mul(w)));
        });
      });
      const np = pv.xyz.add(nv.add(wind).mul(dt)).toVar(), nvv = nv.toVar();
      If(np.y.lessThan(floorY), () => { np.y.assign(floorY); nvv.assign(vec3(nvv.x.mul(.6), nvv.y.mul(bounce.negate()), nvv.z.mul(.6))); });
      pv.assign(vec4(np, select(took.greaterThan(.5), vv.w, pv.w.add(dt)))); vv.assign(vec4(nvv, vv.w));
    });
    P.element(i).assign(pv); V.element(i).assign(vv);
  })().compute(N, [64]);

  // drawing: one camera-facing sprite per slot; dead ones shrink to nothing
  const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: p.additive ? AdditiveBlending : NormalBlending });
  const pv = P.element(instanceIndex), vv = V.element(instanceIndex), cv = C.element(instanceIndex), ev = E.element(instanceIndex), sv = S.element(instanceIndex);
  const f = min(pv.w.div(max(vv.w, 1e-4)), 1), alive = select(pv.w.lessThan(vv.w), float(1), float(0));
  m.positionNode = pv.xyz;
  m.scaleNode = mix(sv.x, sv.y, f).mul(alive);
  m.colorNode = mix(cv.rgb, ev.rgb, f);
  const d = uv().sub(.5), r = dot(d, d).mul(4);
  const shape = p.additive ? smoothstep(1, .3, r) : float(1).sub(r).mul(float(1).sub(r));
  const fade = pow(float(1).sub(f), ev.w).mul(select(sv.z.greaterThan(.5), min(f.mul(6), 1), float(1)));
  m.opacityNode = cv.a.mul(fade).mul(shape).mul(select(r.greaterThan(1), float(0), float(1))).mul(alive);
  // frame generation moves each glowing spark along its own last step (framegen.js), so they move at the screen's rate
  particleMotion(m, pv.xyz, vv.xyz.add(wind).mul(dt).mul(alive));
  const sprite = new Sprite(m); sprite.count = N; sprite.frustumCulled = false; sprite.renderOrder = 5; sprite.userData.noAO = true;

  let fresh = true;
  return {
    sprite,
    /** runs this frame's step: bursts packed by the CPU side, the time since the last step */
    step(r, o) {
      if (fresh) { r.compute(clear); fresh = false; }
      for (let k = 0; k < o.rows.length; k++) rows[k].copy(o.rows[k]);
      nb.value = o.count; dt.value = o.dt; time.value = o.time; grav.value = o.gravity; drag.value = o.drag; bounce.value = o.bounce;
      floorY.value = o.floor ?? -1e9; turb.value.copy(o.turb); wind.value.copy(o.wind);
      na.value = o.pulls?.count ?? 0; if (o.pulls) for (let k = 0; k < o.pulls.count * PULL_ROWS; k++) pullRows[k].copy(o.pulls.rows[k]);
      flowK.value = o.flow ? o.flow.strength : 0;
      if (o.flow) { fMin.value.copy(o.flow.min); fSize.value.copy(o.flow.size); if (o.flow.fresh) { F.value.array.set(o.flow.cells); F.value.needsUpdate = true; o.flow.fresh = false; } }
      r.compute(step);
    },
    /** Tests: where the particles are and how they move, read back from the chip (positions and age; velocities and life). */
    async read(r) { return { P: new Float32Array(await r.getArrayBufferAsync(P.value)), V: new Float32Array(await r.getArrayBufferAsync(V.value)) }; },
    reset() { fresh = true; },
    dispose() { m.dispose(); for (const b of [P, V, C, E, S, F]) b.value?.dispose?.(); },
  };
}
