// gs.flow Flood on WebGPU (gs.outdoors FloodWater): the same "virtual pipes" steps as Flood.step, run
// as TSL compute passes over storage buffers, and a water mesh that reads its heights straight from
// them. Every few frames the depths and flows are copied back for flood.depth(), level() and current().
// Kit use only (hd3d-gpu.js exports it as gpuFlood).
import { Mesh, MeshStandardNodeMaterial, BufferGeometry, Float32BufferAttribute, Vector4 } from 'three/webgpu';
import { Fn, instancedArray, instanceIndex, vertexIndex, uniform, uniformArray, Loop, If, int, float, vec3, vec4, max, min, select, smoothstep, mix, normalize, attribute, varying, transformNormalToView, positionPrevious } from 'three/tsl';

export const FLOOD_SOURCES = 16;

export function gpuFlood(flood, look) {
  const { N, l } = flood, NN = N * N, A = l * l;
  const Bb = instancedArray(NN, 'float'), Db = instancedArray(NN, 'float'), Fb = instancedArray(NN, 'vec4');
  const rows = Array.from({ length: FLOOD_SOURCES }, () => new Vector4()), S = uniformArray(rows, 'vec4'), ns = uniform(0, 'int');
  const h = uniform(1 / 60), rain = uniform(0), damp = uniform(flood.damp), wall = uniform(flood.edges === 'wall' ? 1 : 0), x0 = uniform(flood.x0), z0 = uniform(flood.z0);
  const L = float(l), K = h.mul(9.81).mul(l);
  const ij = c => [int(c).mod(N), int(c).div(N)];

  // water in: taps and drains (each spread over the cells in its disc, as on the CPU) and rain
  const add = Fn(() => {
    const c = instanceIndex, [i, j] = ij(c), cx = x0.add(float(i).add(.5).mul(L)), cz = z0.add(float(j).add(.5).mul(L)), d = Db.element(c).toVar();
    Loop({ start: int(0), end: ns, type: 'int' }, ({ i: k }) => {
      const s = S.element(k);
      If(cx.sub(s.x).mul(cx.sub(s.x)).add(cz.sub(s.y).mul(cz.sub(s.y))).lessThanEqual(s.z.mul(s.z)), () => { d.assign(max(float(0), d.add(s.w))); });
    });
    Db.element(c).assign(d.add(rain.mul(h)));
  })().compute(NN, [64]);
  // flows out of each cell to its four neighbours, cut back so a cell never gives more than it has
  const flux = Fn(() => {
    const c = int(instanceIndex), [i, j] = ij(instanceIndex), dc = Db.element(c), hc = Bb.element(c).add(dc), f = Fb.element(c).toVar();
    const out = (has, n, old) => select(has, max(float(0), old.mul(damp).add(K.mul(hc.sub(Bb.element(n)).sub(Db.element(n))))), select(wall.greaterThan(.5), float(0), max(float(0), old.mul(damp).add(K.mul(max(dc, 0))))));
    const fl = out(i.greaterThan(0), max(c.sub(1), 0), f.x), fr = out(i.lessThan(N - 1), min(c.add(1), NN - 1), f.y);
    const fu = out(j.greaterThan(0), max(c.sub(N), 0), f.z), fd = out(j.lessThan(N - 1), min(c.add(N), NN - 1), f.w);
    const sum = fl.add(fr).add(fu).add(fd).mul(h), have = dc.mul(A), s = select(sum.greaterThan(have), select(sum.greaterThan(0), have.div(sum), float(0)), float(1));
    Fb.element(c).assign(vec4(fl, fr, fu, fd).mul(s));
  })().compute(NN, [64]);
  const move = Fn(() => {
    const c = int(instanceIndex), [i, j] = ij(instanceIndex), f = Fb.element(c);
    const inflow = select(i.greaterThan(0), Fb.element(max(c.sub(1), 0)).y, float(0)).add(select(i.lessThan(N - 1), Fb.element(min(c.add(1), NN - 1)).x, float(0)))
      .add(select(j.greaterThan(0), Fb.element(max(c.sub(N), 0)).w, float(0))).add(select(j.lessThan(N - 1), Fb.element(min(c.add(N), NN - 1)).z, float(0)));
    Db.element(c).assign(max(float(0), Db.element(c).add(inflow.sub(f.x).sub(f.y).sub(f.z).sub(f.w).mul(h).div(A))));
  })().compute(NN, [64]);

  // the water mesh: one vertex per cell, heights and normals from the buffers (as FloodWater does on the CPU)
  const m = new MeshStandardNodeMaterial({ roughness: look.rough, metalness: 0, transparent: look.opacity < 1, opacity: look.opacity, depthWrite: look.opacity >= 1 });
  const vi = int(vertexIndex), [vi_, vj] = ij(vertexIndex);
  const surf = c => { const d = Db.element(c); return select(d.greaterThan(look.dry), Bb.element(c).add(d), Bb.element(c).sub(look.sink)); };
  const hL = surf(select(vi_.greaterThan(0), vi.sub(1), vi)), hR = surf(select(vi_.lessThan(N - 1), vi.add(1), vi));
  const hU = surf(select(vj.greaterThan(0), vi.sub(N), vi)), hD = surf(select(vj.lessThan(N - 1), vi.add(N), vi));
  const nx = hL.sub(hR).div(select(vi_.greaterThan(0).and(vi_.lessThan(N - 1)), float(2 * l), float(l))), nz = hU.sub(hD).div(select(vj.greaterThan(0).and(vj.lessThan(N - 1)), float(2 * l), float(l)));
  const p = attribute('position', 'vec3');
  // (where the pass writes motion, a frame ago's point is the surface too: left at the flat mesh's own height, the
  // whole depth of the water counted as motion, and SGSR 2 and frame generation dragged opaque water and lava with it.
  // How far the surface itself rose in a frame isn't kept: a few millimetres)
  m.positionNode = Fn(builder => { const at = vec3(p.x, surf(vi), p.z); if (builder.needsPreviousData()) positionPrevious.assign(at); return at; })();
  m.normalNode = normalize(transformNormalToView(varying(normalize(vec3(nx, 1, nz)), 'vFloodN')));
  const dep = varying(Db.element(vi), 'vFloodD');
  m.colorNode = vec4(mix(vec3(look.shallowV), vec3(look.deepV), smoothstep(0, look.full, dep)), 1);
  const mesh = new Mesh(look.geometry, m); mesh.frustumCulled = false; mesh.userData.gsTwin = true; mesh.userData.noAO = true; mesh.renderOrder = 2;

  let fresh = true, frame = 0, reading = null;
  return {
    mesh,
    upload() { Bb.value.array.set(flood.B); Db.value.array.set(flood.D); Fb.value.array.set(flood.F); for (const b of [Bb, Db, Fb]) b.value.needsUpdate = true; },
    /** runs `steps` steps of 1/rate seconds, then sometimes copies the water back for the queries */
    step(r, steps) {
      if (fresh || flood.gpu.dirty) { this.upload(); fresh = false; flood.gpu.dirty = false; }
      h.value = 1 / flood.rate; rain.value = flood.rainRate;
      const src = flood.sources.slice(0, FLOOD_SOURCES); ns.value = src.length;
      for (let k = 0; k < src.length; k++) { const s = src[k], n = Math.max(1, look.cellsIn(s)); rows[k].set(s.x, s.z, Math.max(s.r, l * .5), s.rate / flood.rate / (n * A)); }
      for (let k = 0; k < steps; k++) { r.compute(add); r.compute(flux); r.compute(move); flood.t += 1 / flood.rate; }
      if (++frame % 4 === 0 && !reading) {
        reading = Promise.all([r.getArrayBufferAsync(Db.value), r.getArrayBufferAsync(Fb.value)]).then(([d, f]) => {
          if (flood.gpu && !flood.gpu.dirty) { flood.D.set(new Float32Array(d)); flood.F.set(new Float32Array(f)); }
        }).catch(() => {}).finally(() => { reading = null; });
      }
    },
    reset() { fresh = true; },
    dispose() { m.dispose(); for (const b of [Bb, Db, Fb]) b.value?.dispose?.(); },
  };
}
