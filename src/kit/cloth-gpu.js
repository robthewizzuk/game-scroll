// gs.outdoors Cloth on WebGPU: the same small steps as Cloth.step (cloth.js), run as TSL compute passes over every piece's
// points at once, and a mesh that reads its places straight from them. The links are kept by each point (up to LINKS
// of them), so a pass moves a point by its own links only (Jacobi, averaged and a little over-relaxed), with no two
// passes writing one point; a few of those passes a small step make up for what Gauss-Seidel on the CPU does in one.
// Nothing is copied back: the cloth is for looking at. Kit use only (hd3d-gpu.js exports it as gpuCloth).
import { BufferAttribute, Mesh, MeshStandardNodeMaterial, DoubleSide, Vector4 } from 'three/webgpu';
import { Fn, instancedArray, instanceIndex, uniform, uniformArray, Loop, If, int, float, vec3, vec4, max, min, mix, select, normalize, cross, length, dot, attribute, varying, transformNormalToView, positionPrevious, sin, faceDirection } from 'three/tsl';
import { CLOTH, PIECES_MAX, SOLIDS_MAX } from './cloth.js';

const LINKS = 16, ITER = 4, SOLIDS = SOLIDS_MAX, OMEGA = 1.5;

export function gpuCloth(cloth) {
  const { N, P, V, W, A, AR, PI, NB, L } = cloth;
  // ---- the points (xyz and how light: 0 pinned), where each was a small step ago, its speed, where its pin holds it, and a frame ago (for motion)
  const Pb = instancedArray(N, 'vec4'), P2 = instancedArray(N, 'vec4'), Qb = instancedArray(N, 'vec4'), Vb = instancedArray(N, 'vec4'), Ab = instancedArray(N, 'vec4'), A0b = instancedArray(N, 'vec4'), Lb = instancedArray(N, 'vec4');
  const Kb = instancedArray(N * LINKS, 'vec4'), Cb = instancedArray(N, 'float'), Nb = instancedArray(N, 'vec4'), Xb = instancedArray(N, 'vec4'), Tb = instancedArray(N, 'vec2');   // (links: other point, rest, give; how many; neighbours; share of the sheet, piece, lightness and which of people's arms it goes through; the hold it never goes further from, and how far)
  const fill = () => {
    const p = Pb.value.array, q = Qb.value.array, v = Vb.value.array, a = Ab.value.array, a0 = A0b.value.array, l = Lb.value.array, nb = Nb.value.array, x = Xb.value.array, k = Kb.value.array, cn = Cb.value.array, tb = Tb.value.array;
    for (let i = 0; i < N; i++) {
      p[i * 4] = q[i * 4] = l[i * 4] = P[i * 3]; p[i * 4 + 1] = q[i * 4 + 1] = l[i * 4 + 1] = P[i * 3 + 1]; p[i * 4 + 2] = q[i * 4 + 2] = l[i * 4 + 2] = P[i * 3 + 2]; p[i * 4 + 3] = q[i * 4 + 3] = W[i];
      v[i * 4] = V[i * 3]; v[i * 4 + 1] = V[i * 3 + 1]; v[i * 4 + 2] = V[i * 3 + 2];
      a[i * 4] = A[i * 3]; a[i * 4 + 1] = A[i * 3 + 1]; a[i * 4 + 2] = A[i * 3 + 2]; a[i * 4 + 3] = W[i] === 0 ? 1 : 0;
      a0[i * 4] = cloth.A0[i * 3]; a0[i * 4 + 1] = cloth.A0[i * 3 + 1]; a0[i * 4 + 2] = cloth.A0[i * 3 + 2];
      for (let j = 0; j < 4; j++) nb[i * 4 + j] = NB[i * 4 + j];
      x[i * 4] = AR[i]; x[i * 4 + 1] = Math.min(PI[i], PIECES_MAX - 1); x[i * 4 + 2] = W[i]; x[i * 4 + 3] = cloth.pieces[PI[i]]?.skips || 0; tb[i * 2] = cloth.TT[i]; tb[i * 2 + 1] = cloth.TR[i];
    }
    const n = new Int32Array(N);
    const put = (a, b, rest, give) => { if (n[a] >= LINKS) return; const s = (a * LINKS + n[a]++) * 4; k[s] = b; k[s + 1] = rest; k[s + 2] = give; k[s + 3] = 1; };
    for (let c = 0; c < L.length; c += 4) { put(L[c], L[c + 1], L[c + 2], L[c + 3]); put(L[c + 1], L[c], L[c + 2], L[c + 3]); }
    for (let i = 0; i < N; i++) cn[i] = n[i];
    for (const b of [Pb, Qb, Vb, Ab, A0b, Lb, Nb, Xb, Kb, Cb, Tb]) b.value.needsUpdate = true;
  };
  fill(); let again = true;
  const winds = Array.from({ length: PIECES_MAX }, () => new Vector4()), Wd = uniformArray(winds, 'vec4');
  // (solid things now and when it last stepped, each small step taking them part of the way: fr)
  const solidRows = Array.from({ length: SOLIDS * 2 }, () => new Vector4()), Sd = uniformArray(solidRows, 'vec4'), solidWas = Array.from({ length: SOLIDS * 2 }, () => new Vector4()), Sp = uniformArray(solidWas, 'vec4'), ns = uniform(0, 'int');
  const h = uniform(1 / 240), t = uniform(0), damp = uniform(1), floorY = uniform(-1e9), fr = uniform(1), fr0 = uniform(0);

  const facing = (pos, i) => { const nb = Nb.element(i), u = pos.element(int(nb.y)).xyz.sub(pos.element(int(nb.x)).xyz), v = pos.element(int(nb.w)).xyz.sub(pos.element(int(nb.z)).xyz); return cross(u, v); };
  // a small step: the wind's push and gravity, then on (the sheet's facing as it was at the frame's start: this pass moves the points it would read)
  const predict = Fn(() => {
    const i = instanceIndex, p = Pb.element(i), a = Ab.element(i);
    If(a.w.greaterThan(.5), () => { const pin = mix(A0b.element(i).xyz, a.xyz, fr); Qb.element(i).assign(vec4(pin, 0)); Pb.element(i).assign(vec4(pin, 0)); Vb.element(i).assign(vec4(0)); }).Else(() => {
      const x = Xb.element(i), wd = Wd.element(int(x.y)), v = Vb.element(i).xyz, at = p.xyz, FL = CLOTH.FL;
      // (the wind's gusts and its sideways wobble running downwind, as cloth.js has them)
      const sp = wd.w, ax = wd.x.div(max(sp, 1e-6)), az = wd.z.div(max(sp, 1e-6)), u = at.x.mul(ax).add(at.z.mul(az));
      const ph = u.mul(FL.k).sub(t.mul(sp.mul(FL.c1).add(FL.c0))).add(at.y.mul(FL.ky)), g = float(1).add(sin(ph.mul(.7).add(1.7)).mul(sin(t.mul(1.3).add(u.mul(.4)))).mul(FL.gust)), sd = sin(ph).mul(FL.side).mul(sp);
      const rel = vec3(wd.x.mul(g).sub(az.mul(sd)), wd.y.mul(g), wd.z.mul(g).add(ax.mul(sd))).sub(v), rl = length(rel), n0 = facing(Lb, i), nn = length(n0), w = x.z, ar = x.x;
      const sheet = nn.greaterThan(1e-9), n = n0.div(max(nn, 1e-9)), vn = dot(rel, n), aw = ar.mul(w).mul(rl).mul(CLOTH.AIR);
      const f = select(sheet, n.mul(vn.mul(aw)).add(rel.sub(n.mul(vn)).mul(aw.mul(CLOTH.SKIN))), rel.mul(rl.mul(ar).mul(w).mul(.06))).toVar();
      const fa = length(f); If(fa.greaterThan(25), () => { f.assign(f.mul(float(25).div(fa))); });
      const v2 = v.mul(damp).add(f.add(vec3(0, -9.81, 0)).mul(h));
      Qb.element(i).assign(p); Vb.element(i).assign(vec4(v2, 0)); Pb.element(i).assign(vec4(at.add(v2.mul(h)), p.w));
    });
  })().compute(N, [64]);
  // the links: each point moved by its own, averaged (from one set of places into the other)
  const solve = (src, dst) => Fn(() => {
    const i = instanceIndex, p = src.element(i), wi = Xb.element(i).z, d = vec3(0).toVar(), cnt = Cb.element(i);
    If(wi.greaterThan(0), () => {
      Loop({ start: int(0), end: int(cnt), type: 'int' }, ({ i: k }) => {
        const lk = Kb.element(int(i).mul(LINKS).add(k)), j = int(lk.x), wj = Xb.element(j).z, e = p.xyz.sub(src.element(j).xyz), l = length(e);
        If(l.greaterThan(1e-9), () => {
          const al = lk.z.div(h.mul(h)), s = wi.div(wi.add(wj).add(al)).mul(l.sub(lk.y));
          d.subAssign(e.div(l).mul(s));
        });
      });
    });
    dst.element(i).assign(vec4(p.xyz.add(d.mul(OMEGA).div(max(cnt, 1))), p.w));
  })().compute(N, [64]);
  const solveA = solve(Pb, P2), solveB = solve(P2, Pb);
  // solid things and the ground push points out, and each point's speed is what it went
  const finish = Fn(() => {
    const i = instanceIndex, q = Qb.element(i), x = Xb.element(i), pos = Pb.element(i).xyz.toVar(), th = Tb.element(i);
    If(x.z.greaterThan(0), () => {
      If(th.x.greaterThan(-.5), () => { const o = Pb.element(int(th.x)).xyz, e = pos.sub(o), l = length(e); If(l.greaterThan(th.y), () => { pos.assign(o.add(e.mul(th.y.div(l)))); }); });   // (no further from its hold than it was made)
      Loop({ start: int(0), end: ns, type: 'int' }, ({ i: k }) => {
        const a0 = Sp.element(k.mul(2)), a1 = Sd.element(k.mul(2)), b0 = Sp.element(k.mul(2).add(1)), b1 = Sd.element(k.mul(2).add(1));
        const a = mix(a0, a1, fr), b = mix(b0, b1, fr), ab = b.xyz.sub(a.xyz), ap = pos.sub(a.xyz), bb = max(dot(ab, ab), 1e-12);
        const tt = min(max(dot(ap, ab).div(bb), 0), 1), dd = ap.sub(ab.mul(tt)), dl = length(dd), r = mix(a1.w, b1.w, tt).add(.01);   // (a rod may narrow: a thigh to the knee)
        If(dl.lessThan(r).and(dl.greaterThan(1e-9)).and(a0.w.lessThan(.5).or(a0.w.greaterThan(x.w.add(.5)))), () => {   // (a0.w: an arm rod, 1 a forearm, 2 an upper arm; x.w: those it goes through)
          pos.addAssign(dd.mul(r.div(dl).sub(1)));
          // (held by its grip on it, against its own surface's going this small step: a swinging leg carries the skirt on it along)
          const sv = mix(a.xyz.sub(mix(a0, a1, fr0).xyz), b.xyz.sub(mix(b0, b1, fr0).xyz), tt), n = dd.div(dl), m = pos.sub(q.xyz).sub(sv); pos.subAssign(m.sub(n.mul(dot(m, n))).mul(CLOTH.GRIP));
        });
      });
      If(pos.y.lessThan(floorY.add(.01)), () => { pos.y.assign(floorY.add(.01)); pos.x.subAssign(pos.x.sub(q.x).mul(CLOTH.GRIP)); pos.z.subAssign(pos.z.sub(q.z).mul(CLOTH.GRIP)); });
      Pb.element(i).assign(vec4(pos, 0)); Vb.element(i).assign(vec4(pos.sub(q.xyz).div(h), 0));
    });
  })().compute(N, [64]);
  const keep = Fn(() => { Lb.element(instanceIndex).assign(Pb.element(instanceIndex)); })().compute(N, [64]);
  // a piece taken along whole (what it rides was put somewhere else at once: cloth.carry): four rows a piece, an affine matrix's three and whether to
  const carryRows = Array.from({ length: PIECES_MAX * 4 }, () => new Vector4()), Cr = uniformArray(carryRows, 'vec4');
  const carryK = Fn(() => {
    const i = instanceIndex, pc = int(Xb.element(i).y).mul(4);
    If(Cr.element(pc.add(3)).x.greaterThan(.5), () => {
      const r0 = Cr.element(pc), r1 = Cr.element(pc.add(1)), r2 = Cr.element(pc.add(2));
      const tf = v => vec3(dot(r0.xyz, v).add(r0.w), dot(r1.xyz, v).add(r1.w), dot(r2.xyz, v).add(r2.w)), rot = v => vec3(dot(r0.xyz, v), dot(r1.xyz, v), dot(r2.xyz, v));
      for (const B of [Pb, Qb, Lb, A0b]) { const x = B.element(i); x.assign(vec4(tf(x.xyz), x.w)); }
      const v = Vb.element(i); v.assign(vec4(rot(v.xyz), 0));
    });
  })().compute(N, [64]);

  // ---- the mesh: the CPU's geometry (a vertex a point, and a rope's strip under its points), its places and facing from the buffers
  const m = new MeshStandardNodeMaterial({ roughness: cloth.mat.roughness, metalness: 0, side: DoubleSide });
  const at = attribute('clothAt', 'vec2'), pi = int(at.x), drop = vec3(0, at.y.negate(), 0);
  m.positionNode = Fn(builder => { const p = Pb.element(pi).xyz.add(drop); if (builder.needsPreviousData()) positionPrevious.assign(Lb.element(pi).xyz.add(drop)); return p; })();
  const n0 = facing(Pb, pi), nl = length(n0), nw = select(nl.greaterThan(1e-9), n0.div(max(nl, 1e-9)).negate(), vec3(0, 1, 0));
  m.normalNode = normalize(transformNormalToView(varying(nw, 'vClothN'))).mul(faceDirection);
  m.colorNode = vec4(attribute('color', 'vec3'), 1);
  const g = cloth.mesh.geometry, nv = g.attributes.position.count, cat = new Float32Array(nv * 2);
  for (let k = 0; k < Math.min(N, nv); k++) cat[k * 2] = k;
  for (let n = 0; n < cloth.ropeAt.length; n += 2) { cat[cloth.ropeAt[n + 1] * 2] = cloth.ropeAt[n]; cat[cloth.ropeAt[n + 1] * 2 + 1] = .012; }
  g.setAttribute('clothAt', new BufferAttribute(cat, 2));
  const mesh = new Mesh(g, m); mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; mesh.name = 'cloth:gpu';
  Object.assign(mesh.userData, { gsTwin: true, noLod: true, detail: false, noOcclude: true });   // (its geometry's points are where it began: simpler far copies, cluster detail or hiding by those would be wrong)

  return {
    mesh, N, version: cloth.version,
    /** dt seconds of the cloth, in `steps` small steps */
    step(r, dt, steps) {
      // (pins now and when it last stepped: sent while they move, and once more when they stop, so the two agree)
      if (cloth.pinsMoved || again) {
        const a = Ab.value.array, a0 = A0b.value.array, A2 = cloth.A, B = cloth.A0;
        for (let i = 0; i < N; i++) { a[i * 4] = A2[i * 3]; a[i * 4 + 1] = A2[i * 3 + 1]; a[i * 4 + 2] = A2[i * 3 + 2]; a0[i * 4] = B[i * 3]; a0[i * 4 + 1] = B[i * 3 + 1]; a0[i * 4 + 2] = B[i * 3 + 2]; }
        Ab.value.needsUpdate = A0b.value.needsUpdate = true; again = cloth.pinsMoved; cloth.pinsMoved = false;
      }
      cloth.pieces.slice(0, PIECES_MAX).forEach((p, k) => winds[k].set(p.wind[0], p.wind[1], p.wind[2], p.wind[3]));
      const S = cloth.solids.slice(0, SOLIDS); ns.value = S.length;
      S.forEach((s, k) => { const pa = s.pa || s.a, pb = s.pb || s.b; solidRows[k * 2].set(s.a[0], s.a[1], s.a[2], s.r); solidRows[k * 2 + 1].set(s.b[0], s.b[1], s.b[2], s.rb ?? s.r); solidWas[k * 2].set(pa[0], pa[1], pa[2], s.arm || 0); solidWas[k * 2 + 1].set(pb[0], pb[1], pb[2], 0); });
      floorY.value = typeof cloth.ground === 'number' ? cloth.ground : -1e9;
      const hh = Math.min(dt, 1 / 20) / steps; h.value = hh; damp.value = Math.exp(-hh * .6); t.value = cloth.t;
      if (cloth.carries?.length) {
        for (const [k, D] of cloth.carries) { if (k < 0 || k >= PIECES_MAX) continue; const e = D.elements; carryRows[k * 4].set(e[0], e[4], e[8], e[12]); carryRows[k * 4 + 1].set(e[1], e[5], e[9], e[13]); carryRows[k * 4 + 2].set(e[2], e[6], e[10], e[14]); carryRows[k * 4 + 3].set(1, 0, 0, 0); }
        r.compute(carryK); for (const [k] of cloth.carries) carryRows[k * 4 + 3]?.set(0, 0, 0, 0); cloth.carries.length = 0;
      }
      r.compute(keep);
      // (more small steps while limbs swing fast through clothes (cloth.stepsNow), each with fewer passes over the links: about as many in all)
      const pairs = Math.max(1, Math.round(ITER / 2 * cloth.steps / steps));
      for (let s = 0; s < steps; s++) { fr.value = (s + 1) / steps; fr0.value = s / steps; r.compute(predict); for (let k = 0; k < pairs; k++) { r.compute(solveA); r.compute(solveB); } r.compute(finish); }
    },
    dispose() { m.dispose(); g.deleteAttribute('clothAt'); for (const b of [Pb, P2, Qb, Vb, Ab, A0b, Lb, Kb, Cb, Nb, Xb, Tb]) b.value?.dispose?.(); },
  };
}
