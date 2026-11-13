// gs.props.Crowd on WebGPU: crowd.js's 'crowd' look as nodes (hd3d-gpu.js gpuLooks.crowd).
// A vertex takes its pose from two rows of the kind's texture of bone places (three texels a bone: the
// rows of its 3 by 4 matrix), is turned, sized and put where its member stands, and does the same with
// last frame's numbers for the motion three works out (frame generation, SGSR 2, motion blur).
// The shadow maps draw it with the same nodes: three hands a material's positionNode to its shadow pass.
import { Fn, If, attribute, textureLoad, ivec2, int, vec3, vec4, dot, cos, sin, normalize, positionLocal, positionPrevious, normalLocal, tangentLocal } from 'three/tsl';

/** m: a crowd level's material (still a classic one); s: its look ({ uniforms: { gsBake } }); o: the mesh; afterColor: hd3d-gpu.js's. */
export function crowdLook(m, s, o, afterColor) {
  const bake = s.uniforms.gsBake.value, I = attribute('gsSkinI', 'uvec4'), W = attribute('gsSkinW', 'vec4');   // (whole bone numbers and weights in bytes: crowd.js crowdGeo)
  // P (and the directions N, T) through a member's pose: cr is its rows (x, y), how far between them (z) and its size (w)
  const posed = (cr, P, N, T) => {
    const p = vec3(0).toVar(), n = N && vec3(0).toVar(), t = T && vec3(0).toVar(), v = vec4(P, 1);
    const bone = (i, w, row, k) => {
      const x = int(i).mul(3), y = int(row.add(.5)), ww = w.mul(k);
      const a = textureLoad(bake, ivec2(x, y)), b = textureLoad(bake, ivec2(x.add(1), y)), c = textureLoad(bake, ivec2(x.add(2), y));
      p.addAssign(vec3(dot(a, v), dot(b, v), dot(c, v)).mul(ww));
      if (n) n.addAssign(vec3(dot(a.xyz, N), dot(b.xyz, N), dot(c.xyz, N)).mul(ww));
      if (t) t.addAssign(vec3(dot(a.xyz, T), dot(b.xyz, T), dot(c.xyz, T)).mul(ww));
    };
    const row = (r, k) => {
      bone(I.x, W.x, r, k);
      If(W.y.greaterThan(0), () => { bone(I.y, W.y, r, k); });
      If(W.z.greaterThan(0), () => { bone(I.z, W.z, r, k); });
      If(W.w.greaterThan(0), () => { bone(I.w, W.w, r, k); });
    };
    row(cr.x, cr.z.oneMinus());
    If(cr.z.greaterThan(0), () => { row(cr.y, cr.z); });
    return { p, n, t };
  };
  // turned about y and put where the member stands (as rotation.y and position on a figure)
  const turned = (d, a) => { const c = cos(a), q = sin(a); return vec3(c.mul(d.x).add(q.mul(d.z)), d.y, c.mul(d.z).sub(q.mul(d.x))); };
  const stood = (p, at, size) => turned(p, at.w).mul(size).add(at.xyz);
  m.positionNode = Fn(builder => {
    const at = attribute('gsAt', 'vec4'), cr = attribute('gsCrowd', 'vec4');
    if (builder.needsPreviousData()) {
      const atWas = attribute('gsAtWas', 'vec4'), crWas = attribute('gsCrowdWas', 'vec4');
      positionPrevious.assign(stood(posed(crWas, positionPrevious).p, atWas, crWas.w));
    }
    const hasN = builder.hasGeometryAttribute('normal'), hasT = hasN && builder.hasGeometryAttribute('tangent');
    const r = posed(cr, positionLocal, hasN ? normalLocal : null, hasT ? tangentLocal : null);
    if (hasN) normalLocal.assign(normalize(turned(r.n, at.w)));
    if (hasT) tangentLocal.assign(normalize(turned(r.t, at.w)));
    return stood(r.p, at, cr.w);
  })();
  // each member's own tint over the material's colour
  afterColor(m, o, c => c.mul(attribute('gsTint', 'vec4').rgb));
}
