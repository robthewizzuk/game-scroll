// gs.gas on WebGPU: the same steps as gas.js's Sim.step(), run as TSL compute passes over storage buffers
// with hundreds of thousands of cells, and the gas drawn as a lit volume: each pixel's ray is walked
// through two 3D pictures the passes write (the smoke and heat; how much sun reaches each place and how
// much firelight), at half size, and laid over the scene behind what is in front of it.
//
// A step is: carry everything along the flow (advect); put the smoke right after it, with the burning, the
// lift and the sources (react); the flow's swirl (curl); swirls kept alive (confine); how much the flow piles up (diverge); the pressure,
// two dozen rounds (jacobi); the flow gives way to it (project). gas.js explains each: the maths here is
// the same line for line, so the two versions behave alike. Once a frame the light is worked out (the sun
// through the smoke, and the glow of the flames spreading out) and the pictures are written; every few
// frames the gas is copied back, four cells to one, for the gas's questions.
// Kit use only (hd3d-gpu.js exports gpuGas; hd3d-gpu-fx.js puts gasStage in the chain of screen passes).
import { Storage3DTexture, Data3DTexture, HalfFloatType, LinearFilter, Matrix4, Vector2, Vector3, Vector4, Color } from 'three/webgpu';
import {
  Fn, instancedArray, instanceIndex, uniform, uniformArray, Loop, If, Break, int, uint, float, vec2, vec3, vec4, uvec3, max, min, abs, floor, length, dot, cross, exp, pow,
  select, clamp, mix, smoothstep, textureStore, texture3D, uv, rtt, getViewPosition, interleavedGradientNoise, screenCoordinate,
} from 'three/tsl';
import { SOURCES, SOLIDS, SOLID, IGNITE, HEAT, BURNS_AT, FLAME, SMOKE_MAX, VMAX, SHARP, NEAR, GAS, emptyField } from './gas.js';

const LK = 10, LSTEP = 1.5;   // the sun's light: this many looks through the smoke towards it, this many cells apart
const SHADE = .55;            // smoke passes light on as well as stopping it: its own shadow is this much lighter than how much it hides
const GD = .96;               // firelight: the share a cell takes from its neighbours each frame (how far the glow reaches)
const MAXS = 96;              // the most steps a pixel's ray takes through the gas
const HALF = { depthBuffer: false, type: HalfFloatType };
const NONE3 = new Data3DTexture(new Uint8Array(4), 1, 1, 1); NONE3.needsUpdate = true;

export function gpuGas(F) {
  const S = F.sim, { nx, ny, nz, cells } = S, nxy = nx * ny;
  const lx = Math.ceil(nx / 2), ly = Math.ceil(ny / 2), lz = Math.ceil(nz / 2), lcells = lx * ly * lz;
  const fld = emptyField(S), ax = fld.nx, ay = fld.ny, az = fld.nz, acells = ax * ay * az;
  const Ub = instancedArray(cells, 'vec4'), Sb = instancedArray(cells, 'vec4'), U2b = instancedArray(cells, 'vec4'), S2b = instancedArray(cells, 'vec4'), S3b = instancedArray(cells, 'vec4'), Ob = instancedArray(cells, 'vec4'), Wb = instancedArray(cells, 'vec4');
  const Pb = instancedArray(cells, 'float'), P2b = instancedArray(cells, 'float'), Db = instancedArray(cells, 'float'), Mb = instancedArray(cells, 'float'), Bb = instancedArray(cells, 'uint');
  const Lb = instancedArray(lcells, 'vec4'), L2b = instancedArray(lcells, 'vec4'), Ab = instancedArray(acells * 2, 'vec4');
  const tex3 = (a, b, c) => { const t = new Storage3DTexture(a, b, c); t.type = HalfFloatType; t.magFilter = t.minFilter = LinearFilter; t.generateMipmaps = false; return t; };
  const densT = tex3(nx, ny, nz), lightT = tex3(lx, ly, lz);
  const rows = n => Array.from({ length: n }, () => new Vector4());
  const sa = rows(SOURCES), sb = rows(SOURCES), sc = rows(SOURCES), sd = rows(SOURCES), qc = rows(SOLIDS), qa = rows(SOLIDS), q0 = rows(SOLIDS), q1 = rows(SOLIDS), q2 = rows(SOLIDS), qv = rows(SOLIDS), qw = rows(SOLIDS);
  const SA = uniformArray(sa, 'vec4'), SB = uniformArray(sb, 'vec4'), SC = uniformArray(sc, 'vec4'), SD = uniformArray(sd, 'vec4');
  const QC = uniformArray(qc, 'vec4'), QA = uniformArray(qa, 'vec4'), QM0 = uniformArray(q0, 'vec4'), QM1 = uniformArray(q1, 'vec4'), QM2 = uniformArray(q2, 'vec4'), QV = uniformArray(qv, 'vec4'), QW = uniformArray(qw, 'vec4');
  const N = {
    ns: uniform(0, 'int'), nsol: uniform(0, 'int'), clo: uniform(new Vector3()), chi: uniform(new Vector3()), keep: uniform(new Vector4(1, 1, 1, 1)), keepF: uniform(1), burnK: uniform(0), soot: uniform(0),
    lift: uniform(0), weight: uniform(0), eps: uniform(0), wind: uniform(new Vector3()), windK: uniform(0), sun: uniform(new Vector3(0, 1, 0)), od: uniform(0),
  };

  /* ----- pieces the passes share ----- */
  // a pass over n things (cells, light cells): nothing is done for the spare turns of the last group of 64
  const pass = (n, body) => Fn(() => { If(instanceIndex.lessThan(uint(n)), body); })().compute(n, [64]);
  const xyz = () => { const c = int(instanceIndex); return [c.mod(nx), c.div(nx).mod(ny), c.div(nxy)]; };
  const at = (i, j, k) => k.mul(ny).add(j).mul(nx).add(i);
  const middle = (i, j, k) => vec3(float(i).add(.5), float(j).add(.5), float(k).add(.5));
  // the six neighbours of cell c (itself beyond an edge), and what each is (gas.js SOLID: 0 gas, 1 wall or solid, 2 open air)
  const sides = (i, j, k, c) => [select(i.greaterThan(0), c.sub(1), c), select(i.lessThan(nx - 1), c.add(1), c), select(j.greaterThan(0), c.sub(nx), c), select(j.lessThan(ny - 1), c.add(nx), c), select(k.greaterThan(0), c.sub(nxy), c), select(k.lessThan(nz - 1), c.add(nxy), c)].map(n => n.toVar());
  const codes = b => [0, 2, 4, 6, 8, 10].map(sh => int(b.shiftRight(uint(sh)).bitAnd(uint(3))).toVar());
  const solid = b => int(b.shiftRight(uint(12)).bitAnd(uint(1))).equal(1);
  // a buffer's four numbers at a place, blended from the eight cells round it (gas.js advect)
  const tri = (buf, p) => {
    const f = clamp(p.sub(.5), vec3(0), vec3(nx - 1.001, ny - 1.001, nz - 1.001)).toVar(), fl = floor(f).toVar(), t = f.sub(fl).toVar(), b = at(int(fl.x), int(fl.y), int(fl.z)).toVar();
    const e = o => buf.element(b.add(o));
    return mix(mix(mix(e(0), e(1), t.x), mix(e(nx), e(nx + 1), t.x), t.y), mix(mix(e(nxy), e(nxy + 1), t.x), mix(e(nxy + nx), e(nxy + nx + 1), t.x), t.y), t.z);
  };

  // what a blend is worth when some of its eight cells were solid (they hold nothing: the flow's fourth number is 1 in gas, 0 in a solid cell)
  const share = g => select(g.greaterThan(.999), float(1), select(g.greaterThan(.02), float(1).div(max(g, .02)), float(0)));
  // a neighbour if it is gas, else the cell itself
  const gasSides = (i, j, k, c, b) => { const ns = sides(i, j, k, c), cs = codes(b); return ns.map((n, q) => select(cs[q].equal(0), n, c).toVar()); };

  /* ----- the passes ----- */
  // which cells are solid, and how fast the solid thing there moves (gas.js mark)
  const mark = pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex), s = Mb.element(c).toVar(), v = vec3(0).toVar(), here = middle(i, j, k).toVar();
    Loop({ start: int(0), end: N.nsol, type: 'int' }, ({ i: q }) => {
      const C = QC.element(q), A = QA.element(q), e = here.sub(C.xyz).toVar();
      If(s.lessThan(.5).and(dot(e, e).lessThanEqual(A.w.mul(A.w))), () => {
        const p = vec3(dot(QM0.element(q).xyz, e), dot(QM1.element(q).xyz, e), dot(QM2.element(q).xyz, e)).toVar();
        const ball = C.w.lessThan(.5).and(dot(p, p).lessThan(A.x.mul(A.x))), box = C.w.greaterThan(.5).and(C.w.lessThan(1.5)).and(abs(p.x).lessThan(A.x)).and(abs(p.y).lessThan(A.y)).and(abs(p.z).lessThan(A.z));
        const tube = C.w.greaterThan(1.5).and(p.x.mul(p.x).add(p.z.mul(p.z)).lessThan(A.x.mul(A.x))).and(abs(p.y).lessThan(A.y));
        If(ball.or(box).or(tube), () => { s.assign(1); v.assign(QV.element(q).xyz.add(cross(QW.element(q).xyz, e))); });
      });
    });
    Ob.element(c).assign(vec4(v, s));
  });
  // what each cell's six neighbours are
  const mask = pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex), [l, r, d, u, n, f] = sides(i, j, k, c);
    const sol = q => Ob.element(q).w.greaterThan(.5), code = (edge, shut, q) => select(edge, select(shut.greaterThan(.5), int(1), int(2)), select(sol(q), int(1), int(0)));
    const m = select(sol(c), int(SOLID), int(0)).add(code(i.equal(0), N.clo.x, l)).add(code(i.equal(nx - 1), N.chi.x, r).mul(4)).add(code(j.equal(0), N.clo.y, d).mul(16)).add(code(j.equal(ny - 1), N.chi.y, u).mul(64))
      .add(code(k.equal(0), N.clo.z, n).mul(256)).add(code(k.equal(nz - 1), N.chi.z, f).mul(1024));
    Bb.element(c).assign(uint(m));
    Ub.element(c).assign(select(sol(c), vec4(0), vec4(Ub.element(c).xyz, 1)));   // (the flow's fourth number: 1 where there is gas; a solid cell holds nothing)
  });
  // everything carried along the flow: each cell takes what was upstream of it a step ago (gas.js advect, its first half)
  const freshAt = p => p.x.lessThan(0).and(N.clo.x.lessThan(.5)).or(p.x.greaterThan(nx).and(N.chi.x.lessThan(.5))).or(p.y.lessThan(0).and(N.clo.y.lessThan(.5))).or(p.y.greaterThan(ny).and(N.chi.y.lessThan(.5)))
    .or(p.z.lessThan(0).and(N.clo.z.lessThan(.5))).or(p.z.greaterThan(nz).and(N.chi.z.lessThan(.5)));
  const advect = pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex);
    If(solid(Bb.element(c)), () => { U2b.element(c).assign(vec4(0)); S2b.element(c).assign(vec4(0)); }).Else(() => {
      const p = middle(i, j, k).sub(Ub.element(c).xyz).toVar(), u = tri(Ub, p).toVar(), g = share(u.w).toVar();
      U2b.element(c).assign(vec4(u.xyz.mul(g), 1)); S2b.element(c).assign(select(freshAt(p), vec4(0), tri(Sb, p).mul(g)));
    });
  });
  // the smoke, heat and fuel put right after being carried (MacCormack's way), then: smoke thins, heat cools, fuel
  // burns, heat lifts, the wind leans on it, and the sources (gas.js advect, its second half)
  const react = pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex);
    If(solid(Bb.element(c)), () => { S3b.element(c).assign(vec4(0)); }).Else(() => {
      const here = middle(i, j, k).toVar(), u0 = Ub.element(c).xyz.toVar(), s0 = Sb.element(c).toVar(), s = S2b.element(c).toVar();
      If(s.x.add(s.y).add(s.z).add(s0.x).add(s0.y).add(s0.z).greaterThan(1e-4), () => {
        const p = here.sub(u0).toVar();
        If(freshAt(p).not(), () => {
          const fl = floor(clamp(p.sub(.5), vec3(0), vec3(nx - 1.001, ny - 1.001, nz - 1.001))).toVar(), b = at(int(fl.x), int(fl.y), int(fl.z)).toVar(), e = o => Sb.element(b.add(o));
          const lo = min(min(min(e(0), e(1)), min(e(nx), e(nx + 1))), min(min(e(nxy), e(nxy + 1)), min(e(nxy + nx), e(nxy + nx + 1))));
          const hi = max(max(max(e(0), e(1)), max(e(nx), e(nx + 1))), max(max(e(nxy), e(nxy + 1)), max(e(nxy + nx), e(nxy + nx + 1))));
          const to = here.add(u0).toVar(), gk = share(tri(U2b, to).w).toVar();
          If(gk.greaterThan(0), () => { s.assign(clamp(s.add(s0.sub(tri(S2b, to).mul(gk)).mul(SHARP * .5)), lo, hi)); s.w.assign(min(s.w, s.x)); });
        });
        s.mulAssign(N.keep);
        s.y.assign(select(s.y.greaterThan(FLAME), s.y.sub(FLAME).mul(N.keepF).add(FLAME), s.y));
        If(s.y.greaterThan(IGNITE).and(s.z.greaterThan(0)), () => { const burn = s.z.mul(N.burnK).toVar(); s.z.subAssign(burn); s.y.assign(max(s.y, min(float(BURNS_AT), s.y.add(burn.mul(HEAT))))); s.x.assign(min(float(SMOKE_MAX), s.x.add(burn.mul(N.soot)))); });
      });
      // (heat lifts the cell above and the cell below a little too, and smoke weighs on them: gas.js advect)
      const u = U2b.element(c).xyz.toVar(), cs = codes(Bb.element(c)), dn = S2b.element(select(cs[2].equal(0), c.sub(nx), c)).toVar(), up = S2b.element(select(cs[3].equal(0), c.add(nx), c)).toVar();
      u.y.addAssign(N.lift.mul(s.y.mul(.5).add(dn.y.add(up.y).mul(.25))).sub(N.weight.mul(s.x.mul(.5).add(dn.x.add(up.x).mul(.25)))));
      u.addAssign(N.wind.sub(u).mul(N.windK));
      const sp = length(u); u.assign(select(sp.greaterThan(VMAX), u.mul(float(VMAX).div(max(sp, 1e-6))), u));
      Loop({ start: int(0), end: N.ns, type: 'int' }, ({ i: q }) => {
        const A = SA.element(q), B = SB.element(q), C = SC.element(q), e = here.sub(A.xyz), d2 = dot(e, e), r2 = A.w.mul(A.w);
        If(d2.lessThan(r2), () => {
          const w = float(1).sub(d2.div(r2)).toVar(), gain = SD.element(q).y, more = max(float(0), B.x.mul(w).sub(s.x)).mul(gain).toVar();
          s.x.addAssign(more); s.w.assign(min(s.x, s.w.add(more.mul(B.w))));
          s.y.addAssign(max(float(0), B.y.mul(w).sub(s.y)).mul(gain)); s.z.addAssign(max(float(0), B.z.mul(w).sub(s.z)).mul(gain));
          u.addAssign(C.xyz.sub(u).mul(min(float(1), w.mul(C.w))));
        });
      });
      U2b.element(c).assign(vec4(u, 1)); S3b.element(c).assign(s);
    });
  });
  const curl = pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex), b = Bb.element(c);
    If(solid(b), () => { Wb.element(c).assign(vec4(0)); }).Else(() => {
      const [l, r, d, u, n, f] = gasSides(i, j, k, c, b);
      const L = U2b.element(l).xyz, R = U2b.element(r).xyz, D = U2b.element(d).xyz, T = U2b.element(u).xyz, K = U2b.element(n).xyz, Fw = U2b.element(f).xyz;
      const w = vec3(T.z.sub(D.z).sub(Fw.y.sub(K.y)), Fw.x.sub(K.x).sub(R.z.sub(L.z)), R.y.sub(L.y).sub(T.x.sub(D.x))).mul(.5).toVar();
      Wb.element(c).assign(vec4(w, length(w)));
    });
  });
  const confine = pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex), b = Bb.element(c);
    const s = S3b.element(c).toVar(), on = min(float(1), s.x.add(s.y).mul(4)).toVar();
    Sb.element(c).assign(s);
    If(solid(b).or(on.lessThanEqual(0)), () => { Ub.element(c).assign(U2b.element(c)); }).Else(() => {
      const [l, r, d, u, n, f] = gasSides(i, j, k, c, b);
      const g = vec3(Wb.element(r).w.sub(Wb.element(l).w), Wb.element(u).w.sub(Wb.element(d).w), Wb.element(f).w.sub(Wb.element(n).w)).mul(.5).toVar();
      Ub.element(c).assign(vec4(U2b.element(c).xyz.add(cross(g, Wb.element(c).xyz).mul(N.eps.mul(on).div(length(g).add(1e-5)))), 1));
    });
  });
  // a neighbour's speed along its own axis, for how the flow piles up and for the walls: the gas's, a solid thing's own, or (open air) this cell's
  const diverge = pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex), b = Bb.element(c);
    If(solid(b), () => { Db.element(c).assign(0); }).Else(() => {
      const me = Ub.element(c).xyz.toVar(), [l, r, d, u, n, f] = sides(i, j, k, c), [xl, xr, yl, yr, zl, zr] = codes(b);
      const nb = (cd, q, ax, inGrid) => select(cd.equal(0), Ub.element(q)[ax], select(cd.equal(2), me[ax], select(inGrid, Ob.element(q)[ax], float(0))));
      const div = nb(xr, r, 'x', i.lessThan(nx - 1)).sub(nb(xl, l, 'x', i.greaterThan(0))).add(nb(yr, u, 'y', j.lessThan(ny - 1))).sub(nb(yl, d, 'y', j.greaterThan(0))).add(nb(zr, f, 'z', k.lessThan(nz - 1))).sub(nb(zl, n, 'z', k.greaterThan(0))).mul(.5).toVar();
      const here = middle(i, j, k).toVar();
      Loop({ start: int(0), end: N.ns, type: 'int' }, ({ i: q }) => {
        const A = SA.element(q), e = here.sub(A.xyz), d2 = dot(e, e), r2 = A.w.mul(A.w), dv = SD.element(q).x;
        If(dv.notEqual(0).and(d2.lessThan(r2)), () => { div.subAssign(dv.mul(float(1).sub(d2.div(r2)))); });
      });
      Db.element(c).assign(div);
    });
  });
  const jacobi = (Pin, Pout) => pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex), b = Bb.element(c);
    If(solid(b), () => { Pout.element(c).assign(0); }).Else(() => {
      const p = Pin.element(c).toVar(), ns = sides(i, j, k, c), cs = codes(b);
      let sum = float(0); for (let q = 0; q < 6; q++) sum = sum.add(select(cs[q].equal(0), Pin.element(ns[q]), select(cs[q].equal(1), p, float(0))));
      Pout.element(c).assign(sum.sub(Db.element(c)).div(6));
    });
  });
  const jA = jacobi(Pb, P2b), jB = jacobi(P2b, Pb);
  const project = pass(cells, () => {
    const [i, j, k] = xyz(), c = int(instanceIndex), b = Bb.element(c);
    If(solid(b).not(), () => {
      const p = Pb.element(c).toVar(), ns = sides(i, j, k, c), cs = codes(b), inGrid = [i.greaterThan(0), i.lessThan(nx - 1), j.greaterThan(0), j.lessThan(ny - 1), k.greaterThan(0), k.lessThan(nz - 1)];
      const pr = q => select(cs[q].equal(0), Pb.element(ns[q]), select(cs[q].equal(1), p, float(0)));
      const u = Ub.element(c).xyz.sub(vec3(pr(1).sub(pr(0)), pr(3).sub(pr(2)), pr(5).sub(pr(4))).mul(.5)).toVar();
      const wall = (q, ax) => select(inGrid[q], Ob.element(ns[q])[ax], float(0));
      // (which way is away from the walls it touches, slanted in the corner of a stair of cells, and of its speed towards them it keeps NEAR: gas.js project)
      const away = vec3(0).toVar(), wv = vec3(0).toVar();
      for (let q = 0; q < 3; q++) {
        const ax = 'xyz'[q], lo = cs[q * 2].equal(1), hi = cs[q * 2 + 1].equal(1);
        If(lo.and(hi), () => { const w = wall(q * 2, ax).add(wall(q * 2 + 1, ax)).mul(.5).toVar(); u[ax].assign(w); wv[ax].assign(w); })
          .ElseIf(lo, () => { away[ax].assign(1); wv[ax].assign(wall(q * 2, ax)); })
          .ElseIf(hi, () => { away[ax].assign(-1); wv[ax].assign(wall(q * 2 + 1, ax)); });
      }
      const m = dot(away, away).toVar(), vn = dot(u.sub(wv), away).toVar();
      If(m.greaterThan(0).and(vn.lessThan(0)), () => { u.subAssign(away.mul(vn.mul(1 - NEAR).div(m))); });
      Ub.element(c).assign(vec4(u, 1));
    });
  });
  const wipe = pass(cells, () => { const c = int(instanceIndex); Ub.element(c).assign(vec4(0, 0, 0, float(1).sub(Ob.element(c).w))); Sb.element(c).assign(vec4(0)); Pb.element(c).assign(0); P2b.element(c).assign(0); });

  // The light, in cells twice as wide (light is soft, and the glow has to travel). The sun: how much smoke
  // lies between a place and the sun, looked up LK times towards it, and beyond that what the place at the
  // end of the look had last frame (so a tall column shades itself all the way down, a frame or two late).
  // Firelight: each cell takes the flame in its own eight cells and most of what its neighbours had last
  // frame, so the glow spreads out from the flames and fades with distance.
  const lit = (Lin, Lout) => pass(lcells, () => {
    const c = int(instanceIndex), X = c.mod(lx), Y = c.div(lx).mod(ly), Z = c.div(lx * ly), ctr = vec3(float(X).mul(2).add(1), float(Y).mul(2).add(1), float(Z).mul(2).add(1)).toVar();
    const e = float(0).toVar();
    for (let q = 0; q < 8; q++) e.addAssign(max(float(0), Sb.element(at(min(X.mul(2).add(q & 1), nx - 1), min(Y.mul(2).add(q >> 1 & 1), ny - 1), min(Z.mul(2).add(q >> 2), nz - 1))).y.sub(FLAME)));
    const od = float(0).toVar();
    Loop({ start: int(0), end: int(LK), type: 'int' }, ({ i: q }) => {
      const p = ctr.add(N.sun.mul(float(q).add(.75).mul(LSTEP))).toVar();
      If(p.x.greaterThan(0).and(p.y.greaterThan(0)).and(p.z.greaterThan(0)).and(p.x.lessThan(nx)).and(p.y.lessThan(ny)).and(p.z.lessThan(nz)), () => { od.addAssign(Sb.element(at(int(floor(p.x)), int(floor(p.y)), int(floor(p.z)))).x); });
    });
    const pe = ctr.add(N.sun.mul(LK * LSTEP)).mul(.5).toVar(), far = float(1).toVar();
    If(pe.x.greaterThan(0).and(pe.y.greaterThan(0)).and(pe.z.greaterThan(0)).and(pe.x.lessThan(lx)).and(pe.y.lessThan(ly)).and(pe.z.lessThan(lz)), () => { far.assign(Lin.element(int(floor(pe.z)).mul(ly).add(int(floor(pe.y))).mul(lx).add(int(floor(pe.x)))).x); });
    const vis = exp(od.mul(N.od).negate()).mul(far);
    const g6 = (ok, q) => select(ok, Lin.element(q).y, float(0));
    const round = g6(X.greaterThan(0), max(c.sub(1), 0)).add(g6(X.lessThan(lx - 1), min(c.add(1), lcells - 1))).add(g6(Y.greaterThan(0), max(c.sub(lx), 0))).add(g6(Y.lessThan(ly - 1), min(c.add(lx), lcells - 1)))
      .add(g6(Z.greaterThan(0), max(c.sub(lx * ly), 0))).add(g6(Z.lessThan(lz - 1), min(c.add(lx * ly), lcells - 1)));
    const glow = e.mul((1 - GD) / 8).add(round.mul(GD / 6));
    Lout.element(c).assign(vec4(vis, glow, 0, 0));
    textureStore(lightT, uvec3(X, Y, Z), vec4(vis, glow, 0, 1)).toWriteOnly();
  });
  const litA = lit(Lb, L2b), litB = lit(L2b, Lb);
  // the picture the gas is drawn from: smoke, heat, tinted smoke, fuel
  const bake = pass(cells, () => { const [i, j, k] = xyz(), s = Sb.element(int(instanceIndex)); textureStore(densT, uvec3(i, j, k), vec4(s.x, s.y, s.w, s.z)).toWriteOnly(); });
  // the gas four cells to one, for the questions (gas.js Gas.read)
  const answers = pass(acells, () => {
    const c = int(instanceIndex), X = c.mod(ax), Y = c.div(ax).mod(ay), Z = c.div(ax * ay), s = vec4(0).toVar(), u = vec4(0).toVar();
    // (the flow's spare fourth number: how much of the cell is flame, for gas.glow)
    Loop(4, 4, 4, ({ i, j, k }) => { const q = at(min(X.mul(4).add(i), nx - 1), min(Y.mul(4).add(j), ny - 1), min(Z.mul(4).add(k), nz - 1)).toVar(), sq = Sb.element(q); s.addAssign(sq); u.addAssign(vec4(Ub.element(q).xyz, max(float(0), sq.y.sub(FLAME)))); });
    Ab.element(c.mul(2)).assign(s.div(64)); Ab.element(c.mul(2).add(1)).assign(u.div(64));
  });

  const stepList = iters => { const l = [advect, react, curl, confine, diverge]; for (let q = 0; q < iters; q += 2) l.push(jA, jB); l.push(project); return l; };
  let list = null, listFor = -1, shaped = -1, used = false, flip = false, frame = 0, reading = null;
  const lo = new Vector3(S.ox, S.oy, S.oz), size = new Vector3(nx * S.h, ny * S.h, nz * S.h), lk = new Vector3(nx / (2 * lx), ny / (2 * ly), nz / (2 * lz));
  const pseudo = { enabled: false, needsSwap: false, setSize() {}, render() {}, gsFx: { kind: 'gas', id: 0 }, gas: F };   // the gas's place in the view's chain of screen passes (gasStage below)
  const copy = r => {
    r.compute(answers);
    return reading = r.getArrayBufferAsync(Ab.value).then(buf => {
      const A = new Float32Array(buf), fs = fld.S, fu = fld.U;
      for (let q = 0; q < acells; q++) { const o = q * 8, a = q * 4; fs[a] = A[o]; fs[a + 1] = A[o + 1]; fs[a + 2] = A[o + 2]; fs[a + 3] = A[o + 3]; fu[a] = A[o + 4]; fu[a + 1] = A[o + 5]; fu[a + 2] = A[o + 6]; fu[a + 3] = A[o + 7]; }
      fld.steps = S.steps; if (F.twin?.sim === S) F.read(fld);
    }).catch(() => {}).finally(() => { reading = null; });
  };
  return {
    densT, lightT, lo, size, lk, buffers: { Ub, Sb, Pb, Bb, Ob },
    /** Puts the gas in the view's chain of screen passes (or takes it out). */
    show(on) { const v = F.view, ex = v.extras ||= [], i = ex.indexOf(pseudo); if (on && i < 0) ex.push(pseudo); else if (!on && i >= 0) ex.splice(i, 1); },
    /** Runs n steps on the graphics chip, with what gas.js has ready: the sources, the solid things and the world as they are now. */
    step(r, n) {
      if (F.fresh) {
        if (S.S) { Sb.value.array.set(S.S); Ub.value.array.set(S.U); Sb.value.needsUpdate = Ub.value.needsUpdate = true; S.S = S.U = null; }   // (handed over from the smaller version)
        else if (used) r.compute(wipe);
        F.fresh = false;
      }
      if (F.marks) {
        if (shaped !== S.shaped) { shaped = S.shaped; Mb.value.array.set(S.M); Mb.value.needsUpdate = true; }
        const ps = F.packed; N.nsol.value = Math.min(ps.length, SOLIDS);
        for (let i = 0; i < N.nsol.value; i++) { const s = ps[i], m = s.m; qc[i].set(s.cx, s.cy, s.cz, s.T); qa[i].set(s.ax, s.ay, s.az, s.R); q0[i].set(m[0], m[1], m[2], 0); q1[i].set(m[3], m[4], m[5], 0); q2[i].set(m[6], m[7], m[8], 0); qv[i].set(s.vx, s.vy, s.vz, 0); qw[i].set(s.wx, s.wy, s.wz, 0); }
        const cl = F.closed; N.clo.value.set(cl[0], cl[2], cl[4]); N.chi.value.set(cl[1], cl[3], cl[5]);
        r.compute([mark, mask]); F.marks = false;
      }
      S.numbers();
      N.keep.value.set(S.keepS, S.keepH, S.keepS, S.keepS); N.keepF.value = S.keepF; N.burnK.value = S.burnK; N.soot.value = S.soot; N.lift.value = S.lift; N.weight.value = S.weight; N.eps.value = S.eps; N.wind.value.set(S.wx, S.wy, S.wz); N.windK.value = S.windK;
      if (listFor !== F.iters) { listFor = F.iters; list = stepList(F.iters); }
      for (let k = 0; k < n; k++) {
        const src = F.sources(k === 0); N.ns.value = src.n;
        for (let i = 0; i < src.n; i++) { const s = src.rows[i]; sa[i].set(s.x, s.y, s.z, s.r); sb[i].set(s.smoke, s.heat, s.fuel, s.tint); sc[i].set(s.vx, s.vy, s.vz, s.grip); sd[i].set(s.div, s.gain, 0, 0); }
        r.compute(list); F.t += S.dt; S.steps++; used = true;
      }
      if (n || !frame) {
        const L = F.light(); N.sun.value.copy(L.dir); N.od.value = LSTEP * S.h * F.look.thick * SHADE;
        r.compute([flip ? litB : litA, bake]); flip = !flip;
      }
      GAS.backend = 'gpu'; GAS.cells = cells;
      // every few frames the gas is copied back, four cells to one, for the gas's questions
      if (++frame % 6 === 0 && !reading && n) copy(r);
    },
    /** A promise that the gas's answers are up to date with the graphics chip (tests). */
    answers(r) { return (reading || Promise.resolve()).then(() => copy(r)); },
    /** A promise of every cell's smoke, heat, fuel and tinted smoke as they are now on the graphics chip (tests). */
    cellsNow(r) { return (reading || Promise.resolve()).then(() => r.getArrayBufferAsync(Sb.value)).then(b => new Float32Array(b)); },
    dispose() {
      this.show(false);
      for (const b of [Ub, Sb, U2b, S2b, S3b, Ob, Wb, Pb, P2b, Db, Mb, Bb, Lb, L2b, Ab]) b.value?.dispose?.();
      for (const p of [mark, mask, advect, react, curl, confine, diverge, jA, jB, project, wipe, litA, litB, bake, answers]) p.dispose?.();
      densT.dispose(); lightT.dispose();
    },
  };
}

/* ---------- the gas drawn: a stage in the view's chain of screen passes (hd3d-gpu-fx.js STAGE.gas) ---------- */
// Each pixel's ray is walked through the gas's box, from where it enters to where it leaves or meets the
// scene (the scene's depth), a jittered step at a time. At each step the smoke there takes some of the
// light away and sends some back: the sun's (as much as gets through the smoke above, more when looking
// towards the sun), the sky's, and the glow of flames nearby; heat over FLAME shines with the flame's own
// colours. Half size, then softened and laid over the picture.
const flameOf = (heat, Q) => {
  const on = smoothstep(FLAME, FLAME + .3, heat).mul(heat.mul(heat).add(.3)).mul(Q.k.y);
  return mix(mix(Q.f0, Q.f1, clamp(heat.sub(.5).div(.35), 0, 1)), Q.f2, clamp(heat.sub(.85).div(.5), 0, 1)).mul(on);
};
export function gasStage(s, src, U, keep, scaled, ch) {
  const D3 = texture3D(NONE3), L3 = texture3D(NONE3), dT = ch.sp.getTextureNode('depth');
  const Q = {
    invProj: uniform(new Matrix4()), camWorld: uniform(new Matrix4()), cam: uniform(new Vector3()), lo: uniform(new Vector3()), size: uniform(new Vector3(1, 1, 1)), lk: uniform(new Vector3(.5, .5, .5)),
    sun: uniform(new Vector3(0, 1, 0)), sunCol: uniform(new Color()), skyCol: uniform(new Color()), c1: uniform(new Color()), c2: uniform(new Color()), f0: uniform(new Color()), f1: uniform(new Color()), f2: uniform(new Color()),
    k: uniform(new Vector4()),   // how much a unit of smoke hides, how bright flame is, a cell's width, on (1) or off
    steps: uniform(48), px: uniform(new Vector2(1, 1)),
  };
  const half = rtt(Fn(() => {
    const q = uv(), d = dT.sample(q).r, vp = getViewPosition(q, d, Q.invProj), wp = Q.camWorld.mul(vec4(vp, 1)).xyz;
    const rd0 = wp.sub(Q.cam), L0 = length(rd0), rd = rd0.div(max(L0, 1e-4)).toVar(), far = select(d.greaterThanEqual(1), float(1e6), L0);
    // where the ray enters and leaves the gas's box
    const inv = select(rd.greaterThanEqual(vec3(0)), vec3(1), vec3(-1)).div(max(abs(rd), vec3(1e-5))).toVar(), a = Q.lo.sub(Q.cam).mul(inv).toVar(), b = Q.lo.add(Q.size).sub(Q.cam).mul(inv).toVar(), t0 = min(a, b), t1 = max(a, b);
    const tn = max(max(t0.x, t0.y), max(t0.z, float(0))).toVar(), tf = min(min(t1.x, t1.y), min(t1.z, far)).toVar();
    const acc = vec3(0).toVar(), Tr = float(1).toVar();
    If(Q.k.w.greaterThan(.5).and(tf.greaterThan(tn)), () => {
      const ds = max(tf.sub(tn).div(Q.steps), Q.k.z.mul(.5)).toVar(), t = tn.add(ds.mul(interleavedGradientNoise(screenCoordinate))).toVar();
      // (smoke sends more light on the way it was going: brighter looking towards the sun)
      const cs = dot(rd, Q.sun), ph = mix(float(1), float(1 - .4 * .4).div(pow(float(1 + .4 * .4).sub(cs.mul(.8)), 1.5)), .6).toVar();
      Loop({ start: int(0), end: int(MAXS), type: 'int' }, () => {
        If(t.greaterThanEqual(tf).or(Tr.lessThan(.01)), () => { Break(); });
        const w = Q.cam.add(rd.mul(t)).sub(Q.lo).div(Q.size).toVar(), g = D3.sample(w).level(0).toVar();
        If(g.x.greaterThan(.002).or(g.y.greaterThan(FLAME)), () => {
          const l = L3.sample(w.mul(Q.lk)).level(0), cover = float(1).sub(exp(g.x.mul(Q.k.x).mul(ds).negate())).toVar();
          const alb = mix(Q.c1, Q.c2, clamp(g.z.div(max(g.x, 1e-4)), 0, 1));
          const light = Q.sunCol.mul(l.x.mul(ph)).add(Q.skyCol.mul(l.x.mul(.45).add(.55))).add(Q.f1.mul(l.y.mul(Q.k.y).mul(14)));
          acc.addAssign(alb.mul(light).mul(cover).add(flameOf(g.y, Q).mul(ds).mul(2.6)).mul(Tr)); Tr.mulAssign(cover.oneMinus());
        });
        t.addAssign(ds);
      });
    });
    return vec4(acc, Tr.oneMinus());
  })(), 1, 1, HALF);
  ch.fxN.push(half);
  let hw = 0, hh = 0;
  s.set = (p, w, h) => {
    const F = p?.gas, tw = F?.twin; if (!tw || !F.draws || !w) { Q.k.value.w = 0; return; }
    const bw = Math.max(8, Math.ceil(w / 2)), bh = Math.max(8, Math.ceil(h / 2)); if (bw !== hw || bh !== hh) { hw = bw; hh = bh; half.setSize(bw, bh); }
    Q.px.value.set(1 / bw, 1 / bh);
    const cam = ch.cam, L = F.light(), K = F.look;
    D3.value = tw.densT; L3.value = tw.lightT; Q.lo.value.copy(tw.lo); Q.size.value.copy(tw.size); Q.lk.value.copy(tw.lk);
    Q.invProj.value.copy(cam.projectionMatrixInverse); Q.camWorld.value.copy(cam.matrixWorld); cam.getWorldPosition(Q.cam.value);
    Q.sun.value.copy(L.dir); Q.sunCol.value.copy(L.sun); Q.skyCol.value.copy(L.sky); Q.c1.value.copy(K.colour); Q.c2.value.copy(K.colour2); Q.f0.value.copy(K.flame[0]); Q.f1.value.copy(K.flame[1]); Q.f2.value.copy(K.flame[2]);
    Q.k.value.set(K.thick, K.glow, F.sim.h, 1); Q.steps.value = F.steps || 48;
  };
  return keep(Fn(() => {
    const q = uv(), o = Q.px.mul(.75);
    const g = half.sample(q.add(o.mul(vec2(-1, -1)))).add(half.sample(q.add(o.mul(vec2(1, -1))))).add(half.sample(q.add(o.mul(vec2(-1, 1))))).add(half.sample(q.add(o))).mul(.25);
    return vec4(src.sample(q).rgb.mul(g.a.oneMinus()).add(g.rgb), 1);
  })());
}
