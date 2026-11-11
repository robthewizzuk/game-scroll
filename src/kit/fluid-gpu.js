// gs.fluid on WebGPU: the same steps as fluid.js's Sim.step(), run as TSL compute passes over storage
// buffers, with tens of thousands of drops, and the drops drawn straight from those buffers. The drops
// are read back every few frames for the fluid's questions (amount, level, wet) and its drains.
//
// A step is six passes: clear the grid; drops to grid (each drop's weight and push to the 27 cells round
// it, added with atomics in fixed point, since many drops write one cell at once); the grid's weight with
// the walls' mirrors folded in; the push of squeezed liquid, to the grid; the grid's speeds (mirrors,
// gravity, blasts, solid things); grid to drops. fluid.js explains each: the maths here is the same line
// for line, so the two versions behave alike.
// Kit use only (hd3d-gpu.js exports it as gpuFluid).
import { Mesh, MeshStandardNodeMaterial, PlaneGeometry, StorageBufferAttribute, Vector3, Vector4, Node, FrontSide } from 'three/webgpu';
import {
  Fn, instancedArray, storage, instanceIndex, uniform, uniformArray, Loop, If, int, float, vec2, vec3, vec4, ivec3, max, min, abs, sign, floor, length, dot, cross,
  select, clamp, mix, smoothstep, normalize, sqrt, atomicAdd, positionGeometry, positionPrevious, cameraViewMatrix, cameraWorldMatrix, uv,
} from 'three/tsl';
import { RHO, K, VMAX, LO, IN, SKIN, REACH, RAD, SOLIDS, SINKS, PUSHES, bulk, FLUID } from './fluid.js';

const MULT = 4194304, FAR = 480;   // fixed point: 22 bits after the point, sums up to +-512
const SPAWN = 2048;                // new drops sent up in one go

// where a drop is drawn now, and (when the frame keeps motion: frame generation, SGSR 2, motion blur) where it was
class DropPlace extends Node {
  constructor(now, before) { super('vec3'); this.now = now; this.before = before; }
  setup(builder) { if (builder.needsPreviousData?.()) positionPrevious.assign(this.before); return this.now; }
}

export function gpuFluid(F) {
  const S = F.sim, { N, nx, ny, nz, cells } = S, hx = S.hi[0], hy = S.hi[1], hz = S.hi[2], L = F.look;
  const Pb = instancedArray(N, 'vec4'), Vb = instancedArray(N, 'vec4'), Cb = instancedArray(N * 3, 'vec4'), Db = instancedArray(N, 'vec4'), Mb = instancedArray(N, 'vec4');
  const giA = new StorageBufferAttribute(new Int32Array(cells * 4), 1), Gi = storage(giA, 'int', cells * 4).toAtomic(), GiR = storage(giA, 'int', cells * 4);
  const Gm = instancedArray(cells, 'float'), Gf = instancedArray(cells, 'vec4'), Hg = instancedArray(nx * nz, 'float'), Sp = instancedArray(SPAWN * 2, 'vec4');
  const rows = n => Array.from({ length: n }, () => new Vector4());
  const sc = rows(SOLIDS), sa = rows(SOLIDS), si = rows(SOLIDS), s0 = rows(SOLIDS), s1 = rows(SOLIDS), s2 = rows(SOLIDS), sv = rows(SOLIDS), sw = rows(SOLIDS), dk = rows(SINKS), pu = rows(PUSHES), pv = rows(PUSHES);
  const SC = uniformArray(sc, 'vec4'), SA = uniformArray(sa, 'vec4'), SI = uniformArray(si, 'vec4'), SM0 = uniformArray(s0, 'vec4'), SM1 = uniformArray(s1, 'vec4'), SM2 = uniformArray(s2, 'vec4'), SV = uniformArray(sv, 'vec4'), SW = uniformArray(sw, 'vec4');
  const DK = uniformArray(dk, 'vec4'), PU = uniformArray(pu, 'vec4'), PV = uniformArray(pv, 'vec4');
  const U = { grav: uniform(new Vector3()), mu: uniform(F.mu), zeta: uniform(bulk(F.mu)), open: uniform(0), ns: uniform(0, 'int'), ground: uniform(0), nk: uniform(0, 'int'), np: uniform(0, 'int'), moved: uniform(0) };

  /* ----- pieces the passes share ----- */
  const cellOf = (ix, iy, iz) => iz.mul(ny).add(iy).mul(nx).add(ix);
  const enc = v => int(clamp(v, -FAR, FAR).mul(MULT).round());
  const pick = (g, w0, w1, w2) => select(g.equal(0), w0, select(g.equal(1), w1, w2));
  // a place's 27 cells: fn(weight, the way from the place to the cell's middle, the cell's number, and the weight's slope for the look)
  const round27 = (x, fn) => {
    const base = floor(x).toVar(), d = x.sub(base).sub(.5).toVar(), b = ivec3(base).toVar();
    const w0 = d.sub(.5).mul(d.sub(.5)).mul(.5).toVar(), w1 = vec3(.75).sub(d.mul(d)).toVar(), w2 = d.add(.5).mul(d.add(.5)).mul(.5).toVar();
    const e0 = d.sub(.5).toVar(), e1 = d.mul(-2).toVar(), e2 = d.add(.5).toVar();
    Loop(3, 3, 3, ({ i, j, k }) => {
      const wx = pick(i, w0.x, w1.x, w2.x), wy = pick(j, w0.y, w1.y, w2.y), wz = pick(k, w0.z, w1.z, w2.z);
      const r = vec3(float(i).sub(1).sub(d.x), float(j).sub(1).sub(d.y), float(k).sub(1).sub(d.z));
      const slope = vec3(pick(i, e0.x, e1.x, e2.x).mul(wy).mul(wz), wx.mul(pick(j, e0.y, e1.y, e2.y)).mul(wz), wx.mul(wy).mul(pick(k, e0.z, e1.z, e2.z)));
      fn(wx.mul(wy).mul(wz), r, cellOf(b.x.add(i).sub(1), b.y.add(j).sub(1), b.z.add(k).sub(1)), slope);
    });
  };
  // a solid shape at a point in its own axes: vec4(the way out, how far): fluid.js sdf()
  const sdf = (T, p, a) => {
    const sg = sign(p), lb = length(p), ball = vec4(p.div(max(lb, 1e-6)), lb.sub(a.x));
    const q = abs(p).sub(a), mq = max(q, vec3(0)), lq = length(mq), deep = max(q.x, max(q.y, q.z));
    const nIn = select(q.x.greaterThanEqual(q.y).and(q.x.greaterThanEqual(q.z)), vec3(sg.x, 0, 0), select(q.y.greaterThanEqual(q.z), vec3(0, sg.y, 0), vec3(0, 0, sg.z)));
    const box = select(deep.lessThanEqual(0), vec4(nIn, deep), vec4(mq.mul(sg).div(max(lq, 1e-6)), lq));
    const lr = max(length(p.xz), 1e-6), qr = lr.sub(a.x), qy = abs(p.y).sub(a.y), rad = vec3(p.x.div(lr), 0, p.z.div(lr)), up = vec3(0, sg.y, 0);
    const mr = max(qr, 0), my = max(qy, 0), lt = length(vec2(mr, my));
    const tube = select(qr.lessThanEqual(0).and(qy.lessThanEqual(0)), select(qr.greaterThanEqual(qy), vec4(rad, qr), vec4(up, qy)), vec4(rad.mul(mr).add(up.mul(my)).div(max(lt, 1e-6)), lt));
    return select(T.lessThan(.5), ball, select(T.lessThan(1.5), box, tube));
  };
  // the nearest solid thing or ground within REACH of a place: how far its skin is, the way out, how fast that spot moves (fluid.js Sim.near())
  const near = x => {
    const bd = float(REACH).toVar(), bn = vec3(0, 1, 0).toVar(), bu = vec3(0).toVar();
    Loop({ start: int(0), end: U.ns, type: 'int' }, ({ i: k }) => {
      const c = SC.element(k), e = x.sub(c.xyz).toVar(), W = SW.element(k);
      If(dot(e, e).lessThan(W.w.mul(W.w)), () => {
        const m0 = SM0.element(k).xyz, m1 = SM1.element(k).xyz, m2 = SM2.element(k).xyz, A = SA.element(k), I = SI.element(k), Vk = SV.element(k);
        const p = vec3(dot(m0, e), dot(m1, e), dot(m2, e)).toVar(), o = sdf(c.w, p, A.xyz).toVar();
        If(A.w.greaterThan(.5), () => {   // hollow: the outside with the room inside taken away
          const room = sdf(c.w, p.sub(vec3(0, I.w, 0)), I.xyz).toVar();
          If(Vk.w.sub(p.y).lessThan(room.w), () => { room.assign(vec4(0, -1, 0, Vk.w.sub(p.y))); });
          If(room.w.negate().greaterThan(o.w), () => { o.assign(room.negate()); });
        });
        const d = o.w.sub(SKIN);
        If(d.lessThan(bd), () => { bd.assign(d); bn.assign(m0.mul(o.x).add(m1.mul(o.y)).add(m2.mul(o.z))); bu.assign(Vk.xyz.add(cross(W.xyz, e))); });
      });
    });
    If(U.ground.greaterThan(.5), () => {
      const fx = clamp(x.x.sub(.5), 0, nx - 1.001), fz = clamp(x.z.sub(.5), 0, nz - 1.001), u = fx.sub(floor(fx)), w = fz.sub(floor(fz)), a = int(floor(fz)).mul(nx).add(int(floor(fx)));
      const h00 = Hg.element(a), h10 = Hg.element(a.add(1)), h01 = Hg.element(a.add(nx)), h11 = Hg.element(a.add(nx + 1));
      const sx = mix(h10.sub(h00), h11.sub(h01), w), sz = mix(h01.sub(h00), h11.sub(h10), u), gh = mix(mix(h00, h10, u), mix(h01, h11, u), w);
      const l = length(vec3(sx, 1, sz)), d = x.y.sub(gh).div(l).sub(SKIN);
      If(d.lessThan(bd), () => { bd.assign(d); bn.assign(vec3(sx.negate(), 1, sz.negate()).div(l)); bu.assign(vec3(0)); });
    });
    return { bd, bn, bu };
  };
  const inGrid = x => x.x.greaterThan(1.5).and(x.y.greaterThan(1.5)).and(x.z.greaterThan(1.5)).and(x.x.lessThan(nx - 1.5)).and(x.y.lessThan(ny - 1.5)).and(x.z.lessThan(nz - 1.5));
  // the cell this side of the walls that mirrors a cell along one axis, and the cell beyond the wall that mirrors one inside (-1: none)
  const canon = (i, top) => select(i.lessThan(LO), int(2 * LO - 1).sub(i), select(i.greaterThanEqual(top), int(2 * top - 1).sub(i), i));
  const partner = (j, top) => select(j.lessThan(LO + 2), int(2 * LO - 1).sub(j), select(j.greaterThanEqual(top - 2), int(2 * top - 1).sub(j), int(-1)));
  const cellXYZ = () => { const c = int(instanceIndex); return [c.mod(nx), c.div(nx).mod(ny), c.div(nx * ny)]; };

  /* ----- the passes ----- */
  const clear = Fn(() => { const i4 = instanceIndex.mul(4); for (let k = 0; k < 4; k++) GiR.element(i4.add(k)).assign(int(0)); })().compute(cells, [64]);

  // drops to grid, and each drop's twin in the mirror of the solid thing beside it
  const toGrid = Fn(() => {
    const P = Pb.element(instanceIndex);
    If(P.w.greaterThan(0), () => {
      const x = P.xyz.toVar(), v = Vb.element(instanceIndex).xyz.toVar(), c = instanceIndex.mul(3);
      const c0 = Cb.element(c).xyz.toVar(), c1 = Cb.element(c.add(1)).xyz.toVar(), c2 = Cb.element(c.add(2)).xyz.toVar();
      const give = (at, vel, affine) => round27(at, (w, r, cell) => {
        const mv = (affine ? vel.add(vec3(dot(c0, r), dot(c1, r), dot(c2, r))) : vel).mul(w), i4 = cell.mul(4);
        atomicAdd(Gi.element(i4), enc(mv.x)); atomicAdd(Gi.element(i4.add(1)), enc(mv.y)); atomicAdd(Gi.element(i4.add(2)), enc(mv.z)); atomicAdd(Gi.element(i4.add(3)), enc(w));
      });
      give(x, v, true);
      const twin = vec4(x, 0).toVar();
      If(U.ns.greaterThan(0).or(U.ground.greaterThan(.5)), () => {
        const { bd, bn, bu } = near(x);
        If(bd.lessThan(REACH), () => {
          const d = max(bd, 0), tx = x.sub(bn.mul(d.mul(2))).toVar();
          If(inGrid(tx), () => { twin.assign(vec4(tx, 1)); give(tx, v.sub(bn.mul(dot(v.sub(bu), bn).mul(2))).toVar(), false); });
        });
      });
      Mb.element(instanceIndex).assign(twin);
    });
  })().compute(N, [64]);

  // the grid's weight, with what went beyond each wall folded back (the walls are mirrors)
  const massOf = (ix, iy, iz) => float(GiR.element(cellOf(ix, iy, iz).mul(4).add(3)));
  const weigh = Fn(() => {
    const [ix, iy, iz] = cellXYZ(), m = float(0).toVar();
    If(U.open.greaterThan(.5), () => { m.assign(massOf(ix, iy, iz)); }).Else(() => {
      const jx = canon(ix, hx).toVar(), jy = canon(iy, hy).toVar(), jz = canon(iz, hz).toVar(), px = partner(jx, hx).toVar(), py = partner(jy, hy).toVar(), pz = partner(jz, hz).toVar();
      m.assign(massOf(jx, jy, jz));
      If(px.greaterThanEqual(0), () => { m.addAssign(massOf(px, jy, jz)); If(py.greaterThanEqual(0), () => { m.addAssign(massOf(px, py, jz)); If(pz.greaterThanEqual(0), () => { m.addAssign(massOf(px, py, pz)); }); }); If(pz.greaterThanEqual(0), () => { m.addAssign(massOf(px, jy, pz)); }); });
      If(py.greaterThanEqual(0), () => { m.addAssign(massOf(jx, py, jz)); If(pz.greaterThanEqual(0), () => { m.addAssign(massOf(jx, py, pz)); }); });
      If(pz.greaterThanEqual(0), () => { m.addAssign(massOf(jx, jy, pz)); });
    });
    Gm.element(instanceIndex).assign(m.div(MULT));
  })().compute(cells, [64]);

  // how squeezed each drop is, and the push that gives its cells (and its twin's)
  const press = Fn(() => {
    const P = Pb.element(instanceIndex);
    If(P.w.greaterThan(0), () => {
      const x = P.xyz.toVar(), rho = float(0).toVar(), grad = vec3(0).toVar();
      round27(x, (w, r, cell, slope) => { const m = Gm.element(cell); rho.addAssign(m.mul(w)); grad.addAssign(slope.mul(m)); });
      rho.assign(max(rho, 1e-4));
      Db.element(instanceIndex).assign(vec4(grad.div(-RHO), rho.div(RHO)));
      const c = instanceIndex.mul(3), c0 = Cb.element(c).xyz.toVar(), c1 = Cb.element(c.add(1)).xyz.toVar(), c2 = Cb.element(c.add(2)).xyz.toVar();
      const q = min(rho.div(RHO), 3), q2 = q.mul(q), kp = float(4).div(rho).mul(max(float(0), q2.mul(q2).sub(1).mul(K))).toVar(), kv = min(float(1).div(rho), rho.div(RHO * RHO)).mul(-4).toVar();
      const sq = kv.mul(U.zeta).mul(c0.x.add(c1.y).add(c2.z)).add(kp), m2 = kv.mul(U.mu);
      const t0 = vec3(m2.mul(2).mul(c0.x).add(sq), m2.mul(c0.y.add(c1.x)), m2.mul(c0.z.add(c2.x))).toVar();
      const t1 = vec3(t0.y, m2.mul(2).mul(c1.y).add(sq), m2.mul(c1.z.add(c2.y))).toVar(), t2 = vec3(t0.z, t1.z, m2.mul(2).mul(c2.z).add(sq)).toVar();
      const push = (at, r0, r1, r2) => round27(at, (w, r, cell) => {
        const i4 = cell.mul(4);
        atomicAdd(Gi.element(i4), enc(dot(r0, r).mul(w))); atomicAdd(Gi.element(i4.add(1)), enc(dot(r1, r).mul(w))); atomicAdd(Gi.element(i4.add(2)), enc(dot(r2, r).mul(w)));
      });
      push(x, t0, t1, t2);
      const M = Mb.element(instanceIndex);
      If(M.w.greaterThan(.5), () => { push(M.xyz.toVar(), vec3(kp, 0, 0).toVar(), vec3(0, kp, 0).toVar(), vec3(0, 0, kp).toVar()); });
    });
  })().compute(N, [64]);

  // the grid: each cell's speed (the cells beyond a wall: their mirror cell's, turned round)
  const move = Fn(() => {
    const [ix, iy, iz] = cellXYZ(), walls = U.open.lessThan(.5);
    const jx = select(walls, canon(ix, hx), ix).toVar(), jy = select(walls, canon(iy, hy), iy).toVar(), jz = select(walls, canon(iz, hz), iz).toVar();
    const px = select(walls, partner(jx, hx), int(-1)).toVar(), py = select(walls, partner(jy, hy), int(-1)).toVar(), pz = select(walls, partner(jz, hz), int(-1)).toVar();
    const m = float(0).toVar(), mom = vec3(0).toVar();
    const add = (ax, ay, az, sx, sy, sz) => { const i4 = cellOf(ax, ay, az).mul(4).toVar(); m.addAssign(float(GiR.element(i4.add(3)))); mom.addAssign(vec3(float(GiR.element(i4)).mul(sx), float(GiR.element(i4.add(1))).mul(sy), float(GiR.element(i4.add(2))).mul(sz))); };
    add(jx, jy, jz, 1, 1, 1);
    If(px.greaterThanEqual(0), () => { add(px, jy, jz, -1, 1, 1); If(py.greaterThanEqual(0), () => { add(px, py, jz, -1, -1, 1); If(pz.greaterThanEqual(0), () => { add(px, py, pz, -1, -1, -1); }); }); If(pz.greaterThanEqual(0), () => { add(px, jy, pz, -1, 1, -1); }); });
    If(py.greaterThanEqual(0), () => { add(jx, py, jz, 1, -1, 1); If(pz.greaterThanEqual(0), () => { add(jx, py, pz, 1, -1, -1); }); });
    If(pz.greaterThanEqual(0), () => { add(jx, jy, pz, 1, 1, -1); });
    const v = vec3(0).toVar();
    If(m.greaterThan(MULT * 1e-6), () => {
      v.assign(mom.div(m).add(U.grav));
      const at = vec3(float(jx).add(.5), float(jy).add(.5), float(jz).add(.5)).toVar();
      Loop({ start: int(0), end: U.np, type: 'int' }, ({ i: k }) => {
        const b = PU.element(k), s = PV.element(k), e = at.sub(b.xyz), l = length(e);
        If(l.lessThan(b.w), () => { const f = float(1).sub(l.div(b.w)); v.addAssign(e.mul(s.x.mul(f).div(max(l, 1e-6)))); v.y.addAssign(s.y.mul(f)); });
      });
      If(U.ns.greaterThan(0).or(U.ground.greaterThan(.5)), () => {
        const { bd, bn, bu } = near(at);
        If(bd.lessThan(0), () => { const q = v.sub(bu).toVar(), vn = dot(q, bn); If(vn.lessThan(0), () => { q.subAssign(bn.mul(vn)); }); v.assign(bu.add(q)); });
      });
    });
    const turn = vec3(select(jx.equal(ix), float(1), float(-1)), select(jy.equal(iy), float(1), float(-1)), select(jz.equal(iz), float(1), float(-1)));
    Gf.element(instanceIndex).assign(vec4(v.mul(turn), m.div(MULT)));
  })().compute(cells, [64]);

  // grid to drops
  const toDrops = Fn(() => {
    const P = Pb.element(instanceIndex);
    If(P.w.greaterThan(0), () => {
      const x = P.xyz.toVar(), v = vec3(0).toVar(), b0 = vec3(0).toVar(), b1 = vec3(0).toVar(), b2 = vec3(0).toVar();
      round27(x, (w, r, cell) => { const u = Gf.element(cell).xyz.mul(w).toVar(); v.addAssign(u); b0.addAssign(r.mul(u.x)); b1.addAssign(r.mul(u.y)); b2.addAssign(r.mul(u.z)); });
      const sp = length(v), ok = sp.lessThanEqual(VMAX), c = instanceIndex.mul(3), keep = select(ok, float(4), select(sp.greaterThan(VMAX), float(4), float(0)));
      Cb.element(c).assign(vec4(b0.mul(keep), 0)); Cb.element(c.add(1)).assign(vec4(b1.mul(keep), 0)); Cb.element(c.add(2)).assign(vec4(b2.mul(keep), 0));
      v.assign(select(ok, v, select(sp.greaterThan(VMAX), v.mul(float(VMAX).div(sp)), vec3(0))));
      x.addAssign(v);
      const alive = float(1).toVar();
      If(U.ns.greaterThan(0).or(U.ground.greaterThan(.5)), () => {
        const { bd, bn, bu } = near(x);
        If(bd.lessThan(IN), () => { x.addAssign(bn.mul(float(IN).sub(bd))); const vn = dot(v.sub(bu), bn); If(vn.lessThan(0), () => { v.subAssign(bn.mul(vn)); }); });
      });
      If(U.open.greaterThan(.5), () => {
        If(x.x.lessThan(LO).or(x.x.greaterThan(hx)).or(x.y.lessThan(LO)).or(x.y.greaterThan(hy)).or(x.z.lessThan(LO)).or(x.z.greaterThan(hz)), () => { alive.assign(0); });
      }).Else(() => {
        const lo = vec3(LO + IN), hi = vec3(hx - IN, hy - IN, hz - IN), was = x.toVar();
        x.assign(clamp(x, lo, hi));
        v.assign(select(was.lessThan(lo), max(v, vec3(0)), select(was.greaterThan(hi), min(v, vec3(0)), v)));
      });
      Loop({ start: int(0), end: U.nk, type: 'int' }, ({ i: k }) => {
        const s = DK.element(k), e = x.sub(s.xyz);
        If(alive.greaterThan(.5).and(dot(e, e).lessThan(s.w.mul(s.w))), () => { alive.assign(float(k).add(1).negate()); });
      });
      Pb.element(instanceIndex).assign(vec4(x, alive)); Vb.element(instanceIndex).assign(vec4(v, 0));
    });
  })().compute(N, [64]);

  // new drops: the place, speed and slot of each, sent up from fluid.js
  const spawn = Fn(() => {
    const a = Sp.element(instanceIndex.mul(2)), b = Sp.element(instanceIndex.mul(2).add(1)), slot = int(a.w).toVar();
    Pb.element(slot).assign(vec4(a.xyz, 1)); Vb.element(slot).assign(vec4(b.xyz, 0));
    Cb.element(slot.mul(3)).assign(vec4(0)); Cb.element(slot.mul(3).add(1)).assign(vec4(0)); Cb.element(slot.mul(3).add(2)).assign(vec4(0));
    Db.element(slot).assign(vec4(0, 0, 0, 1));
  })().compute(SPAWN, [64]);
  const passes = [clear, toGrid, weigh, press, move, toDrops];

  /* ----- the drops, drawn as round cards that face the camera ----- */
  // Each card is lit as a ball, blended towards the way the liquid's skin faces there (from how the weight
  // of liquid falls away round the drop: nothing inside the liquid, straight out at its surface; against a
  // wall of the box, straight out through the wall, as liquid looks through glass), so a pool reads as one
  // smooth body and a lone drop as a bead. Thin and fast liquid whitens to foam (fluid.js foamOf()).
  const mat = new MeshStandardNodeMaterial({ roughness: L.rough, metalness: 0 });
  mat.shadowSide = FrontSide;   // (the cards face the light as its shadow is drawn: three would draw their backs)
  const pA = Pb.toAttribute(), vA = Vb.toAttribute(), dA = Db.toAttribute();
  const O = uniform(new Vector3(S.ox, S.oy, S.oz)), R = uniform(RAD * S.h * F.size);
  const right = cameraWorldMatrix.mul(vec4(1, 0, 0, 0)).xyz, up = cameraWorldMatrix.mul(vec4(0, 1, 0, 0)).xyz, corner = positionGeometry.xy;
  const rad = select(pA.w.greaterThan(0), R, float(0)), now = O.add(pA.xyz.mul(S.h)).add(right.mul(corner.x.mul(rad))).add(up.mul(corner.y.mul(rad)));
  mat.positionNode = new DropPlace(now, now.sub(vA.xyz.mul(S.h).mul(U.moved)));
  const cq = uv().mul(2).sub(1), r2 = dot(cq, cq);
  mat.maskNode = r2.lessThanEqual(1);
  const toWall = max(vec3(0), vec3(1).sub(vec3(hx, hy, hz).sub(pA.xyz))).sub(max(vec3(0), vec3(1).sub(pA.xyz.sub(LO)))).mul(float(1).sub(U.open)).mul(smoothstep(.45, .8, dA.w).mul(.45));   // (spray up a wall stays beads)
  const out = dA.xyz.add(toWall), ball = vec3(cq.x, cq.y, sqrt(max(float(0), float(1).sub(r2)))), gv = cameraViewMatrix.mul(vec4(out, 0)).xyz, gl = length(out);
  const skin = normalize(vec3(gv.x, gv.y, max(gv.z, gl.mul(.25)).add(1e-5)));
  mat.normalNode = normalize(mix(ball, skin, smoothstep(.06, .3, gl).mul(.85)));
  const foam = L.foam ? min(float(.85), max(float(0), float(.4).sub(dA.w).div(.3)).add(max(float(0), length(vA.xyz).sub(S.foam0).div(1.4 * S.foam0)))) : float(0);
  const col = L.foam ? mix(vec3(L.colour.r, L.colour.g, L.colour.b), vec3(L.foam.r, L.foam.g, L.foam.b), foam) : vec3(L.colour.r, L.colour.g, L.colour.b);
  mat.colorNode = vec4(col, 1);
  if (L.glow) mat.emissiveNode = col.mul(L.glow);
  const mesh = new Mesh(new PlaneGeometry(2, 2), mat); mesh.count = N; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = F.shadows; mesh.userData.gsTwin = true; mesh.userData.gsMoved = 0;

  // the drops copied back: one copy at a time (three keeps one read buffer for each attribute)
  let frame = 0, flying = 0, queue = Promise.resolve(), groundAt = null;
  const copy = r => { flying++; const p = queue.then(() => r.getArrayBufferAsync(Pb.value)).then(b => new Float32Array(b)); queue = p.then(() => { flying--; }, () => { flying--; }); return p; };
  const up4 = (b, a) => { b.value.array.set(a); b.value.needsUpdate = true; };
  return {
    mesh, buffers: { Pb, Vb, Db },
    /** Runs n steps on the graphics chip, with what fluid.js has ready: new drops, the solids, drains and blasts as they are now. */
    step(r, n) {
      const sp = Sp.value.array;
      if (F.cpuOwns) { up4(Pb, S.P); up4(Vb, S.V); up4(Cb, S.C); F.cpuOwns = false; F.staged.length = 0; }
      for (let at = 0; at < F.staged.length; at += SPAWN) {
        const k = Math.min(SPAWN, F.staged.length - at);
        for (let i = 0; i < k; i++) { const s = F.staged[at + i], a = s * 4, o = i * 8; sp[o] = S.P[a]; sp[o + 1] = S.P[a + 1]; sp[o + 2] = S.P[a + 2]; sp[o + 3] = s; sp[o + 4] = S.V[a]; sp[o + 5] = S.V[a + 1]; sp[o + 6] = S.V[a + 2]; sp[o + 7] = 0; }
        Sp.value.needsUpdate = true; spawn.count = k; r.compute(spawn);
      }
      F.staged.length = 0;
      if (S.H !== groundAt || F.groundNew) { groundAt = S.H; F.groundNew = false; if (S.H) up4(Hg, S.H); }
      U.ground.value = S.H ? 1 : 0; U.open.value = F.open ? 1 : 0; U.mu.value = F.mu; U.zeta.value = bulk(F.mu);
      const kg = S.dt * S.dt / S.h; U.grav.value.set(F.gravity.x * kg, F.gravity.y * kg, F.gravity.z * kg);
      const ps = F.packed; U.ns.value = Math.min(ps.length, SOLIDS);
      for (let i = 0; i < U.ns.value; i++) {
        const s = ps[i], m = s.m;
        sc[i].set(s.cx, s.cy, s.cz, s.T); sa[i].set(s.ax, s.ay, s.az, s.hol ? 1 : 0); si[i].set(s.ix, s.iy, s.iz, s.io);
        s0[i].set(m[0], m[1], m[2], 0); s1[i].set(m[3], m[4], m[5], 0); s2[i].set(m[6], m[7], m[8], 0); sv[i].set(s.vx, s.vy, s.vz, s.cut); sw[i].set(s.wx, s.wy, s.wz, s.R);
      }
      U.nk.value = Math.min(F.drains.length, SINKS); for (let i = 0; i < U.nk.value; i++) { const d = F.drains[i]; dk[i].set(d.gx, d.gy, d.gz, d.gr); }
      U.np.value = n ? Math.min(F.blasts.length, PUSHES) : 0; for (let i = 0; i < U.np.value; i++) { const b = F.blasts[i]; pu[i].set(b.x, b.y, b.z, b.r); pv[i].set(b.s, b.up, 0, 0); }
      for (let k = 0; k < n; k++) r.compute(passes);
      S.steps += n; U.moved.value = n; R.value = RAD * S.h * F.size; mesh.userData.gsMoved = S.steps;   // (hd3d.js draws its shadow again when it moves)
      FLUID.backend = 'gpu'; FLUID.drops = S.alive;
      // every few frames the drops are copied back for the fluid's questions and its drains
      if (++frame % (N > 20000 ? 6 : 4) === 0 && !flying) { const at = S.steps; copy(r).then(P => { if (F.twin?.sim === S) F.read(P, at); }, () => {}); }
    },
    /** A promise of the drops as they are now on the graphics chip; the fluid's count and its answers are up to date when it resolves (tests). */
    drops(r) { const at = S.steps; return copy(r).then(P => { if (F.twin?.sim === S) F.read(P, at); return P; }); },
    dispose() { mat.dispose(); mesh.geometry.dispose(); for (const b of [Pb, Vb, Cb, Db, Mb, Gm, Gf, Hg, Sp]) b.value?.dispose?.(); giA.dispose?.(); },
  };
}
