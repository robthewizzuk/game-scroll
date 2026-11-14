// gs.models.vehicle's looks on WebGPU, as nodes (hd3d-gpu.js gpuLooks): vehicle-looks.js's 'carpaint' (flakes,
// dirt, scrapes, rain beading) and 'carglass' (see-through glass, cracks and holes, a broken lamp, a dirty film
// with the wipers' fans, drops). The same sums as the WebGL version: change both.
// Kit use only.
import { Fn, If, Discard, attribute, uniformArray, positionView, normalView, modelViewMatrix, materialRoughness, materialMetalness, materialEmissive, materialClearcoat,
  materialClearcoatRoughness, materialOpacity, vec2, vec3, vec4, float, floor, fract, abs, min, max, clamp, dot, cross, normalize, length, smoothstep, step, mix, select,
  atan, sqrt, pow, fwidth } from 'three/tsl';

// the hash and the value noise, as functions of their own (each is called many times)
const H3 = Fn(([q]) => { const a = fract(q.mul(.1031)).toVar(); a.addAssign(dot(a, a.zyx.add(31.32))); return fract(a.x.add(a.y).mul(a.z)); })
  .setLayout({ name: 'gsCpH', type: 'float', inputs: [{ name: 'q', type: 'vec3' }] });
const N3 = Fn(([q]) => {
  const i = floor(q).toVar(), f = fract(q).toVar(), s = f.mul(f).mul(f.mul(-2).add(3)).toVar(), c = (x, y, z) => H3(i.add(vec3(x, y, z)));
  return mix(mix(mix(c(0, 0, 0), c(1, 0, 0), s.x), mix(c(0, 1, 0), c(1, 1, 0), s.x), s.y), mix(mix(c(0, 0, 1), c(1, 0, 1), s.x), mix(c(0, 1, 1), c(1, 1, 1), s.x), s.y), s.z);
}).setLayout({ name: 'gsCpN3', type: 'float', inputs: [{ name: 'q', type: 'vec3' }] });
// a drop of water: (its dome's slope across and along, how near its edge)
const DROP = Fn(([p, n, density, k]) => {
  const t = select(abs(n.y).lessThan(.95), normalize(cross(vec3(0, 1, 0), n)), vec3(1, 0, 0)).toVar(), b = cross(n, t).toVar();
  const side = float(1).sub(smoothstep(.3, .8, abs(n.y))).toVar();
  const q = vec2(dot(p, t), dot(p, b)).mul(vec2(k, k.mul(mix(float(1), float(.62), side)))).toVar(), c = floor(q).toVar(), f = fract(q).sub(.5).toVar();
  const r = H3(vec3(c, 13)).mul(.26).add(.17).toVar(), on = step(H3(vec3(c, 7)), density.mul(float(1).sub(side.mul(.45)))).toVar();
  const d = f.sub(vec2(H3(vec3(c, 3)), H3(vec3(c, 5))).sub(.5).mul(float(1).sub(r.mul(2)))).div(r).toVar(), l = dot(d, d).toVar();
  on.mulAssign(step(l, 1));
  return vec3(d.mul(on), on.mul(smoothstep(.45, 1, l)));
}).setLayout({ name: 'gsCpDrop', type: 'vec3', inputs: [{ name: 'p', type: 'vec3' }, { name: 'n', type: 'vec3' }, { name: 'density', type: 'float' }, { name: 'k', type: 'float' }] });

const XYZW = ['x', 'y', 'z', 'w'];
// what both looks start from: the car's own point and normal, metres a pixel, how wet, and the surface's two directions in view space
function base(u, live) {
  const p = attribute('position', 'vec3'), n = normalize(attribute('normal', 'vec3')).toVar('gsCpN'), fpm = length(fwidth(p)).toVar('gsCpFpm');
  const tObj = select(abs(n.y).lessThan(.95), cross(vec3(0, 1, 0), n), vec3(1, 0, 0)), tv = modelViewMatrix.mul(vec4(tObj, 0)).xyz;
  const N = normalView, T = normalize(tv.sub(N.mul(dot(tv, N))).add(1e-6)).toVar('gsCpT'), B = cross(N, T).toVar('gsCpB');
  const tl = normalize(tObj.add(1e-6)).toVar('gsCpTo');
  const own = u.gsCpA ? live(u.gsCpA).z : live(u.gsCgA).y, wet = max(own, 0).toVar('gsCpWet');   // (the car's own: the weather's rain beads it through the view's air, gpuWet)
  return { p, n, fpm, T, B, N, tl, wet };
}

/** m: a car's paint (still a classic material); s: its look; o: the mesh; afterColor, live: hd3d-gpu.js's. */
export function carPaintLook(m, s, o, { afterColor, live }) {
  if (!s) return;   // (a copy made without the look's settings)
  const u = s.uniforms, A = live(u.gsCpA), SZ = live(u.gsCpB), XK = live(u.gsCpXK), X = uniformArray(u.gsCpX.value, 'vec4');
  const { p, n, fpm, T, B, N, tl, wet } = base(u, live);
  // dirt and scrapes: (dust film, road grime, primer showing, bare metal)
  const S = Fn(() => {
    const f = float(0).toVar(), g = float(0).toVar(), sc = float(0).toVar(), ba = float(0).toVar();
    If(XK.x.add(XK.y).add(XK.z).add(XK.w).greaterThan(0), () => {
      for (let i = 0; i < 4; i++) {
        const h = X.element(i);
        If(h.w.greaterThan(0), () => {
          const d = length(p.sub(h.xyz)).div(h.w).toVar();
          If(d.lessThan(1), () => {
            const a = dot(p, tl), k = XK[XYZW[i]], core = float(1).sub(smoothstep(.15, .9, d));
            const st = N3(vec3(a.mul(1.3), p.y.mul(75), i * 5)).mul(.7).add(N3(vec3(a.mul(4), p.y.mul(160), i * 5 + 2)).mul(.3));
            const st2 = N3(vec3(a.mul(2), p.y.mul(260), i * 5 + 9));
            sc.assign(max(sc, smoothstep(.5, .56, st.add(core.mul(.42)).sub(d.mul(.2))).mul(core).mul(k)));
            ba.assign(max(ba, smoothstep(.74, .78, st2.add(core.mul(.3))).mul(core).mul(k)));
          });
        });
      }
    });
    If(A.y.greaterThan(0), () => {
      const y = clamp(p.y.sub(SZ.z).div(max(SZ.y.sub(SZ.z), .3)), 0, 1), low = float(1).sub(smoothstep(0, .55, y)), tail = smoothstep(.1, .5, p.z.div(SZ.x));
      const big = N3(p.mul(1.4).add(A.w)), fine = N3(p.mul(vec3(13, 2.2, 13)).add(A.w)), speck = N3(p.mul(38).add(A.w));
      const grime = low.mul(fine.mul(.45).add(.55)).add(tail.mul(.3)).add(big.sub(.5).mul(.25));
      const dust = big.mul(.3).add(.35).add(smoothstep(.6, .92, n.y).mul(.3)).add(speck.sub(.5).mul(.15));
      g.assign(smoothstep(float(1).sub(A.y.mul(1.1)), float(1.25).sub(A.y.mul(1.1)), grime).mul(.9)); f.assign(smoothstep(.2, .9, dust.mul(A.y).mul(1.4)).mul(.55));
    });
    return vec4(f, g, sc, ba);
  })().toVar('gsCpS');
  // the dirt's own shades (only where there is dirt)
  const Ks = Fn(() => { const k = vec2(1).toVar(); If(A.y.greaterThan(0), () => { k.assign(vec2(N3(p.mul(38).add(A.w)).mul(.2).add(.9), N3(p.mul(vec3(13, 2.2, 13)).add(A.w)).mul(.4).add(.8))); }); return k; })().toVar('gsCpKs');
  const dm = max(max(S.x, S.y), max(S.z, S.w)).toVar('gsCpDm');
  // flakes: (their tilt in view space, how much they show)
  const FL = Fn(() => {
    const out = vec4(0).toVar();
    If(A.x.greaterThan(0).and(dm.lessThan(.9)), () => {
      const vis = A.x.mul(float(1).sub(smoothstep(.45, 1.2, fpm.mul(320)))).mul(float(1).sub(dm)).toVar(), c = floor(p.mul(320)).add(A.w).toVar();
      If(vis.greaterThan(.01).and(H3(c).lessThan(.3)), () => {
        const r = vec2(H3(c.add(17.3)), H3(c.add(41.9))).mul(2).sub(1);
        out.assign(vec4(T.mul(r.x).add(B.mul(r.y)).mul(vis.mul(.2)), vis));
      });
    });
    return out;
  })().toVar('gsCpFl');
  // rain on the coat: (the drop's tilt in view space, how near its edge)
  const BD = Fn(() => {
    const out = vec4(0).toVar();
    If(wet.greaterThan(0), () => {
      const vis = float(1).sub(smoothstep(.6, 1.3, fpm.mul(65)));
      If(vis.greaterThan(0), () => { const d = DROP(p, n, mix(float(.18), float(.5), wet), float(65)).mul(vis); out.assign(vec4(T.mul(d.x).add(B.mul(d.y)).mul(.9), d.z)); });
    });
    return out;
  })().toVar('gsCpBd');
  const bead = step(1e-6, dot(BD.xyz, BD.xyz)), coat = (m.clearcoat || 0) > 0;
  const nv = clamp(dot(normalView, normalize(positionView.negate())), 0, 1);
  afterColor(m, o, d0 => {
    let c = mix(mix(d0, vec3(.42, .42, .41), S.z.mul(.85)), vec3(.62, .63, .64), S.w);
    c = mix(mix(c, vec3(.47, .43, .37).mul(Ks.x), S.x), vec3(.2, .17, .13).mul(Ks.y), S.y);
    c = c.mul(mix(float(1), nv.mul(.55).add(.6), A.x.mul(float(1).sub(dm))));
    return c.mul(float(1).sub(BD.w.mul(.3)));
  });
  const dirt = max(S.x, S.y);
  let r = mix(materialRoughness, mix(float(.65), float(.3), S.w), max(S.z, S.w));
  r = mix(r, float(.92), dirt); r = mix(r, float(.16), FL.w.mul(.6)); r = mix(r, float(.1), wet.mul(.5).mul(float(1).sub(dm)));
  if (!coat) r = select(bead.greaterThan(0), float(.05), r);
  m.roughnessNode = r;
  m.metalnessNode = mix(mix(mix(materialMetalness, float(.85), S.w), float(0), dirt), float(.9), FL.w.mul(.6));
  m.normalNode = normalize(normalView.add(FL.xyz).add(coat ? vec3(0) : BD.xyz));
  if (coat) {
    m.clearcoatNode = materialClearcoat.mul(float(1).sub(dm)); m.clearcoatRoughnessNode = mix(materialClearcoatRoughness, float(.55), dm);
    m.clearcoatNormalNode = normalize(normalView.add(BD.xyz));
  }
}

/** m: a car's glass or lamp (still a classic material); s: its look; o: the mesh; afterColor, live: hd3d-gpu.js's. */
export function carGlassLook(m, s, o, { afterColor, live }) {
  if (!s) return;
  const u = s.uniforms, A = live(u.gsCgA), SC = live(u.gsCgS), SZ = live(u.gsCpB), K = live(u.gsCgK), Hs = uniformArray(u.gsCgH.value, 'vec4');
  const { p, n, fpm, T, B, wet } = base(u, live), lamp = step(A.z, 0);
  // the hits: (cracks, how dark a broken lamp is); a holed pane is gone near its hit
  const HT = Fn(() => {
    const crack = float(0).toVar(), dark = float(0).toVar();
    for (let i = 0; i < 4; i++) {
      const h = Hs.element(i), kind = K[XYZW[i]];
      If(h.w.greaterThan(0), () => {
        const v = p.sub(h.xyz), d = length(v).toVar(), r = h.w;
        const t = select(abs(n.y).lessThan(.95), normalize(cross(vec3(0, 1, 0), n)), vec3(1, 0, 0)), b = cross(n, t), g = vec2(dot(v, t), dot(v, b));
        const a = atan(g.y, g.x).toVar(), lw = max(fpm, .0008).toVar();
        const holed = kind.greaterThan(1.5).and(kind.lessThan(2.5));
        const edge = select(holed, r.mul(N3(vec3(a.mul(2.2), i * 7, 1)).sub(.5).mul(.5).add(.72)), float(0)).toVar();
        If(d.lessThan(edge), () => { Discard(); });
        const reach = select(kind.greaterThan(2.5), r.mul(1.15), select(kind.greaterThan(1.5), r.mul(1.35), r.mul(2.2)));
        If(d.lessThanEqual(reach), () => {
          const fade = float(1).sub(smoothstep(r.mul(.2), reach, d));
          const uu = a.mul(1.91).add(N3(vec3(d.mul(7), i, 3)).mul(.3)).add(i * .37), arc = abs(fract(uu).sub(.5)).div(1.91).mul(d);
          const star = float(1).sub(smoothstep(lw.mul(.4), lw.mul(1.4), arc)).mul(step(.2, H3(vec3(floor(uu), i, 1)))).mul(step(edge, d));
          const q = sqrt(d.div(r)).mul(7).add(N3(vec3(a.mul(3), i, 5)).mul(.5));
          const ring = float(1).sub(smoothstep(lw.mul(.4), lw.mul(1.4), abs(fract(q).sub(.5)).div(7).mul(2).mul(sqrt(d.mul(r))))).mul(step(.5, H3(vec3(floor(a.mul(2.6).add(q)), floor(q), i))));
          const craze = select(holed, float(1).sub(smoothstep(0, r.mul(.22), d.sub(edge))).mul(.5), float(1).sub(smoothstep(r.mul(.04), r.mul(.16), d)));
          crack.assign(max(crack, max(max(star, ring.mul(.85)).mul(fade), craze.mul(.9))));
          If(kind.greaterThan(2.5), () => { dark.assign(max(dark, float(1).sub(smoothstep(r.mul(.6), r.mul(1.05), d)))); });
        });
      });
    }
    return vec2(crack, dark);
  })().toVar('gsCgHt');
  // a film of dirt, wiped clean in two fans on the windscreen
  const FM = Fn(() => {
    const film = float(0).toVar();
    If(A.x.greaterThan(0), () => {
      const wiped = float(0).toVar();
      If(SC.w.greaterThan(0).and(n.z.lessThan(-.3)), () => {
        for (let s2 = 0; s2 < 2; s2++) { const f = vec3(SC.x.add(s2 * .62), SC.y, SC.z); wiped.assign(max(wiped, float(1).sub(smoothstep(SC.w.sub(.05), SC.w, length(p.sub(f)))).mul(step(f.y, p.y)))); }
      });
      const big = N3(p.mul(3).add(A.w)), th = float(1).sub(A.x.mul(1.1)), low = float(1).sub(smoothstep(0, .5, p.y.sub(SZ.z).div(max(SZ.y.sub(SZ.z), .3))));
      film.assign(smoothstep(th, th.add(.3), big.mul(.6).add(low.mul(.3)).add(.25)).mul(float(1).sub(wiped.mul(.92))).mul(.85));
    });
    return film;
  })().toVar('gsCgFm');
  // drops of rain: (their tilt in view space, how near their edge)
  const DR = Fn(() => {
    const out = vec4(0).toVar();
    If(wet.greaterThan(0).and(lamp.lessThan(.5)), () => {
      const vis = float(1).sub(smoothstep(.6, 1.3, fpm.mul(110)));
      If(vis.greaterThan(0), () => {
        const onScreen = SC.w.greaterThan(0).and(n.z.lessThan(-.3)), dd = min(length(p.sub(vec3(SC.x, SC.y, SC.z))), length(p.sub(vec3(SC.x.add(.62), SC.y, SC.z))));
        const fan = select(onScreen, float(1).sub(float(1).sub(smoothstep(SC.w.sub(.05), SC.w, dd)).mul(.7)), float(1));
        const d = DROP(p, n, mix(float(.2), float(.58), wet).mul(fan), float(110)).mul(vis);
        out.assign(vec4(T.mul(d.x).add(B.mul(d.y)).mul(.9), d.z));
      });
    });
    return out;
  })().toVar('gsCgDr');
  const drop = step(1e-6, dot(DR.xyz, DR.xyz)), crack = HT.x, dark = HT.y;
  afterColor(m, o, d0 => mix(mix(d0, vec3(.34, .31, .26), FM).mul(float(1).sub(DR.w.mul(.5))), vec3(.78, .8, .8), crack.mul(float(1).sub(lamp.mul(.5)))).mul(float(1).sub(dark.mul(.55))));
  m.roughnessNode = mix(select(drop.greaterThan(0), float(.04), mix(materialRoughness, float(.8), FM)), float(.55), crack);
  m.normalNode = normalize(normalView.add(DR.xyz));
  m.emissiveNode = materialEmissive.mul(float(1).sub(dark));
  if (u.gsCgA.value.z > 0) {   // see-through glass: its opacity by the angle (and where it is cracked, dirty or wet)
    const nv = clamp(dot(normalize(normalView.add(DR.xyz)), normalize(positionView.negate())), 0, 1), fr = pow(float(1).sub(nv), 4);
    const a0 = select(drop.greaterThan(0), max(A.z, DR.w.mul(.4).add(.25)), A.z);
    m.opacityNode = clamp(max(a0.add(float(1).sub(a0).mul(fr).mul(.85)), max(crack.mul(.9), FM)), 0, 1);
  } else m.opacityNode = materialOpacity;
}
