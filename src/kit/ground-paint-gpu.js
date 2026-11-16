// gs.city's ground paint on WebGPU, as nodes (hd3d-gpu.js): ground-paint.js's paint (the ground worked out
// from where each texel is in the world, and the stamps) and its 'groundpaint' look (the ground's materials
// reading the two pictures in place of their own map). The same sums as the WebGL version: change both.
// Kit use only.
import { MeshBasicNodeMaterial, NoBlending, DoubleSide, RendererUtils } from 'three/webgpu';
import { Fn, If, Loop, uniform, uniformArray, texture, positionWorld, normalWorldGeometry, materialColor, materialRoughness, reference,
  vec2, vec3, vec4, float, int, floor, fract, mod, abs, min, max, clamp, dot, length, sqrt, cos, sin, smoothstep, step, mix, select, dFdx, dFdy, fwidth } from 'three/tsl';
import { DataTexture, LinearFilter } from 'three';
import { ORIGIN } from './origin.js';

const ORG = uniform(ORIGIN);
// the hash, the value noise, a crack's edge and a stain, as functions of their own (each is called many times)
const H = Fn(([p]) => { const a = fract(vec3(p.x, p.y, p.x).mul(.1031)).toVar(); a.addAssign(dot(a, a.yzx.add(33.33))); return fract(a.x.add(a.y).mul(a.z)); })
  .setLayout({ name: 'gsGpH', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
const N = Fn(([p]) => {
  const i = floor(p).toVar(), f = fract(p).toVar(), s = f.mul(f).mul(f.mul(-2).add(3)).toVar();
  return mix(mix(H(i), H(i.add(vec2(1, 0))), s.x), mix(H(i.add(vec2(0, 1))), H(i.add(vec2(1, 1))), s.x), s.y);
}).setLayout({ name: 'gsGpN', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
const F = p => N(p).mul(.5).add(N(p.mul(2.03).add(7.1)).mul(.3)).add(N(p.mul(4.11).add(3.7)).mul(.2));
const EDGE = Fn(([p]) => {
  const ci = floor(p).toVar(), f = fract(p).toVar(), d1 = float(8).toVar(), d2 = float(8).toVar();
  Loop(3, 3, ({ i, j }) => {
    const g = vec2(float(j).sub(1), float(i).sub(1)), c = ci.add(g), r = g.add(vec2(H(c), H(c.add(19.7)))).sub(f), d = dot(r, r).toVar();
    If(d.lessThan(d1), () => { d2.assign(d1); d1.assign(d); }).ElseIf(d.lessThan(d2), () => { d2.assign(d); });
  });
  return sqrt(d2).sub(sqrt(d1));
}).setLayout({ name: 'gsGpEdge', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
const STAIN = Fn(([p, cell, often, seed]) => {
  const c = floor(p.div(cell)).toVar(), out = float(0).toVar();
  If(H(c.add(seed)).lessThanEqual(often), () => {
    const at = c.add(.2).add(vec2(H(c.add(seed).add(5)), H(c.add(seed).add(6))).mul(.6)).mul(cell), r = cell.mul(H(c.add(seed).add(7)).mul(.2).add(.1)).toVar();
    out.assign(float(1).sub(smoothstep(r.mul(.4), r, length(p.sub(at)).mul(N(p.mul(2.7).add(seed)).mul(.45).add(1)))));
  });
  return out;
}).setLayout({ name: 'gsGpStain', type: 'float', inputs: [{ name: 'p', type: 'vec2' }, { name: 'cell', type: 'float' }, { name: 'often', type: 'float' }, { name: 'seed', type: 'float' }] });

// paint on the ground, chipped (PAINT_GLSL's gpChip)
const CHIP = Fn(([p, wear, gap]) => {
  const n = N(p.mul(17)).mul(.45).add(N(p.mul(57).add(11)).mul(.33)).add(N(p.mul(181).add(5)).mul(.22)), t = mix(float(.26), float(.62), clamp(wear.add(N(p.mul(.45).add(7)).mul(.35)).sub(.1), 0, 1)).toVar();
  return smoothstep(t.sub(.045), t.add(.045), n.mul(.7).add(N(p.mul(3.3).add(2)).mul(.3))).mul(float(1).sub(gap));
}).setLayout({ name: 'gsGpChip', type: 'float', inputs: [{ name: 'p', type: 'vec2' }, { name: 'wear', type: 'float' }, { name: 'gap', type: 'float' }] });

// the ground at p (metres, the world's own): its colour (linear) and roughness, from its base colour and kind (PAINT_GLSL's gpPaint)
function paint(p, base, kind, St) {
  const c = base.mul(F(p.mul(.07)).mul(.32).add(.84)).toVar(), r = float(.86).toVar(), gap = float(0).toVar(), wear = float(0).toVar();
  If(kind.lessThan(.5), () => {   // asphalt: repairs, stones, cracks, oil
    const cell = floor(p.div(7)).toVar(), h = H(cell.add(11)).toVar();
    If(h.lessThan(.3), () => {   // a patch: newer and darker, or older and paler, with a sealed seam round it
      const lo = cell.mul(7).add(vec2(H(cell.add(1)), H(cell.add(2))).mul(3)).toVar(), hi = lo.add(1.5).add(vec2(H(cell.add(3)), H(cell.add(4))).mul(3.5)).toVar();
      const q = smoothstep(lo.sub(.01), lo.add(.01), p).mul(float(1).sub(smoothstep(hi.sub(.01), hi.add(.01), p))), e = min(p.sub(lo), hi.sub(p));
      const inP = q.x.mul(q.y).toVar(), seam = float(1).sub(smoothstep(.02, .05, min(e.x, e.y))).mul(inP);
      c.mulAssign(mix(float(1), select(h.lessThan(.15), float(.72), float(1.22)), inP)); c.mulAssign(float(1).sub(seam.mul(.35)));
    });
    const fine = N(p.mul(45)).toVar(), stone = step(.93, H(floor(p.mul(70))));
    c.mulAssign(fine.mul(.2).add(.9)); c.assign(mix(c, c.mul(1.7).add(.02), stone.mul(.7)));
    // cracks: a wandering net in some places; long sealed tar lines in others
    const w = p.add(vec2(N(p.mul(1.3)), N(p.mul(1.3).add(9))).sub(.5).mul(.5));
    const crack = float(1).sub(smoothstep(.004, .016, EDGE(w.div(2.3)))).mul(smoothstep(.62, .7, N(p.mul(.35).add(5)))).toVar();
    const tar = float(1).sub(smoothstep(.003, .009, abs(N(p.mul(.17).add(3.1)).sub(.5)))).mul(step(.55, N(p.mul(.05).add(1.7)))).toVar();
    c.mulAssign(float(1).sub(crack.mul(.55))); c.assign(mix(c, base.mul(.45), tar.mul(.8)));
    r.assign(mix(r.add(fine.sub(.5).mul(.08)), float(.95), crack)); r.assign(mix(r, float(.55), tar));
    const oil = STAIN(p, float(3), float(.16), float(31)).toVar(); c.mulAssign(float(1).sub(oil.mul(.45))); r.assign(mix(r, float(.5), oil.mul(.8)));
    gap.assign(max(crack, tar.mul(.6)));
  }).ElseIf(kind.lessThan(2.5), () => {   // paving slabs (.6 m) or a plaza's flags (1.2 m), laid in a bond
    const S = select(kind.lessThan(1.5), float(.6), float(1.2)).toVar(), q0 = p.div(S), q = vec2(q0.x.add(step(1, mod(floor(q0.y), 2)).mul(.5)), q0.y).toVar();
    const id = floor(q).toVar(), f = fract(q).toVar(), hs = H(id.add(7)).toVar();
    c.mulAssign(hs.mul(.2).add(.9)); If(hs.greaterThan(.97), () => { c.mulAssign(.8); });
    const j = min(min(f.x, float(1).sub(f.x)), min(f.y, float(1).sub(f.y))).mul(S), joint = float(1).sub(smoothstep(.004, .01, j)).toVar();
    If(H(id.add(13)).lessThan(.07), () => {
      const a = H(id.add(1)), b = H(id.add(2)), d = abs(f.x.sub(mix(a, b, f.y)).add(N(q.mul(9)).sub(.5).mul(.04))).mul(S);
      joint.assign(max(joint, float(1).sub(smoothstep(.002, .006, d)).mul(.8)));
    });
    const fine = N(p.mul(60)); c.mulAssign(fine.mul(.12).add(.94).mul(float(1).sub(joint.mul(.45)))); r.assign(mix(r.add(.04), float(1), joint));
    const gc = floor(p.mul(1.1)).toVar();
    If(H(gc.add(3)).lessThan(.25), () => {
      const gp = gc.add(vec2(H(gc.add(4)), H(gc.add(5)))).div(1.1);
      c.assign(mix(c, base.mul(.25), float(1).sub(smoothstep(.008, .014, length(p.sub(gp)))).mul(.8)));
    });
    const st = STAIN(p, float(2.6), float(.1), float(47)).toVar(); c.mulAssign(float(1).sub(st.mul(.3))); r.assign(mix(r, float(.7), st.mul(.5)));
    gap.assign(joint);
  }).ElseIf(kind.lessThan(3.5), () => {   // grass
    c.mulAssign(N(p.mul(1.3)).mul(.3).add(.85)); r.assign(1);
  }).Else(() => {   // a yard's cast concrete slabs: tar in the joints, pale stones, cracks (some sealed), wear, oil, rust
    const SZ = vec2(6, 4.5), q = p.div(SZ), id = floor(q).toVar(), f = fract(q).toVar(), hs = H(id.add(7)).toVar(), hs2 = H(id.add(8)).toVar();
    c.mulAssign(hs.mul(.3).add(.84));
    const e = min(f, f.oneMinus()).mul(SZ), jd = min(e.x, e.y).add(N(p.mul(3.1)).sub(.5).mul(.018)).toVar(), tw = N(p.mul(.9).add(4)).mul(.018).add(.014).toVar();
    const tar = float(1).sub(smoothstep(tw.mul(.55), tw, jd)).toVar(), edge = float(1).sub(smoothstep(tw, tw.add(.03), jd)).mul(tar.oneMinus());
    const fine = N(p.mul(55)).toVar(), agg = smoothstep(.66, .82, N(p.mul(34).add(3))).mul(.6).add(step(.955, H(floor(p.mul(85)))).mul(.6));
    c.mulAssign(fine.mul(.2).add(.9)); c.assign(mix(c, c.mul(1.45).add(.025), agg.mul(.55))); c.mulAssign(float(1).sub(edge.mul(.18)));
    const area = smoothstep(.78, .9, N(p.mul(.28).add(2)).mul(.7).add(hs.mul(.45))).toVar();
    const w = p.add(vec2(N(p.mul(1.7)), N(p.mul(1.7).add(9))).sub(.5).mul(.4)), ed = EDGE(w.div(1.7)).toVar();
    const aa = fwidth(p.x).div(1.7), cw = max(float(.011), aa.mul(1.5)).toVar(), sw = max(float(.022), aa.mul(2)).toVar();   // (never thinner than a texel of the picture)
    const sealed = step(.6, hs2), crack = float(1).sub(smoothstep(cw.mul(.3), cw, ed)).mul(area).mul(sealed.oneMinus()).mul(clamp(float(.0165).div(cw), .35, 1)).toVar(), seal = float(1).sub(smoothstep(sw.mul(.45), sw, ed)).mul(area).mul(sealed).toVar();
    c.mulAssign(float(1).sub(crack.mul(.5))); c.assign(mix(c, base.mul(.1), max(tar.mul(.94), seal.mul(.8))));
    r.assign(float(.8).add(fine.sub(.5).mul(.1)).add(N(p.mul(9)).sub(.5).mul(.08))); r.assign(mix(r, float(.55), max(tar, seal))); r.assign(mix(r, float(.95), crack));
    wear.assign(smoothstep(.58, .82, F(p.mul(.06).add(13))).mul(.5)); c.mulAssign(float(1).sub(wear.mul(.16))); r.subAssign(wear.mul(.12));
    const oil = STAIN(p, float(4), float(.14), float(31)).toVar(); c.mulAssign(float(1).sub(oil.mul(.5))); r.assign(mix(r, float(.48), oil.mul(.85)));
    const rust = STAIN(p, float(5.5), float(.07), float(63)); c.assign(mix(c, c.mul(vec3(1.35, .9, .6)), rust.mul(.7)));
    gap.assign(max(max(tar, seal), crack));
  });
  // the stamps on this piece: oil, skid marks, scorches; polished lanes; painted lines and hatched boxes
  Loop({ start: int(0), end: St.n, type: 'int' }, ({ i }) => {
    const A = St.A.element(i).toVar(), B = St.B.element(i).toVar(), C = St.C.element(i).toVar(), d = p.sub(A.xy), cs = cos(A.w), sn = sin(A.w);
    const lm = vec2(cs.mul(d.x).add(sn.mul(d.y)), sn.negate().mul(d.x).add(cs.mul(d.y))).toVar(), l = lm.div(A.z).toVar(), n = N(p.mul(3).add(B.w)).toVar();
    If(B.x.lessThan(.5), () => {
      const s = float(1).sub(smoothstep(.5, 1, length(l).mul(n.mul(.3).add(1)))).toVar(); c.mulAssign(float(1).sub(s.mul(.5).mul(B.y))); r.assign(mix(r, float(.45), s));
    }).ElseIf(B.x.lessThan(1.5), () => {
      const dy = abs(abs(l.y.mul(A.z)).sub(B.z.mul(.5)));
      const s = float(1).sub(smoothstep(.06, .1, dy)).mul(smoothstep(-1, -.8, l.x)).mul(float(1).sub(smoothstep(.6, 1, l.x))).mul(N(p.mul(20)).mul(.4).add(.6));
      c.mulAssign(float(1).sub(s.mul(.6).mul(B.y)));
    }).ElseIf(B.x.lessThan(2.5), () => {
      const s = float(1).sub(smoothstep(.2, 1, length(l).mul(n.mul(.4).add(1)))).toVar(); c.assign(mix(c, c.mul(.15), s.mul(B.y))); r.assign(mix(r, float(.95), s));
    }).ElseIf(B.x.lessThan(3.5).or(B.x.greaterThan(4.5)), () => {   // a painted line, or a hatched box: chipped, worn where wheels run
      const wob = N(p.mul(23).add(B.w)).sub(.5).mul(.012).toVar(), inside = float(0).toVar();
      If(B.x.lessThan(3.5), () => {
        inside.assign(float(1).sub(smoothstep(B.z.mul(.5).sub(.006), B.z.mul(.5).add(.006), abs(lm.y).add(wob))).mul(float(1).sub(smoothstep(A.z.sub(.01), A.z.add(.01), abs(lm.x)))));
        If(C.w.greaterThan(0), () => { const k = fract(lm.x.div(C.w.mul(2)).add(.25)); inside.mulAssign(smoothstep(.48, .5, k).mul(float(1).sub(smoothstep(.98, 1, k)))); });
      }).Else(() => {
        const bd = vec2(A.z, B.z).sub(abs(lm)), rim = min(bd.x, bd.y).toVar(), k = fract(lm.x.add(lm.y).div(max(C.w, .1)));
        const stripe = smoothstep(.47, .5, k).mul(float(1).sub(smoothstep(.97, 1, k)));
        inside.assign(smoothstep(-.006, .006, rim.add(wob)).mul(max(float(1).sub(smoothstep(.1, .112, rim.add(wob))), stripe)));
      });
      const s = inside.mul(CHIP(p.add(B.w), wear.add(B.y.oneMinus()), gap)).toVar();
      c.assign(mix(c, C.rgb.mul(N(p.mul(.7).add(B.w)).mul(.28).add(.72)), s.mul(.94))); r.assign(mix(r, float(.62), s));
    }).Else(() => {   // a lane worn by traffic: polished smoother and darker, rubber in the two wheel tracks
      const across = abs(lm.y).div(max(B.z.mul(.5), .01)).toVar(), along = float(1).sub(smoothstep(A.z.sub(1.5), A.z, abs(lm.x))).toVar();
      const s = float(1).sub(smoothstep(.55, 1.05, across.add(n.sub(.5).mul(.3)))).mul(along).mul(B.y).toVar();
      const tracks = float(1).sub(smoothstep(.08, .22, abs(across.sub(.5)).add(N(p.mul(1.9).add(B.w)).sub(.5).mul(.12)))).mul(along).mul(B.y).toVar();
      wear.assign(max(wear, s)); c.mulAssign(float(1).sub(s.mul(.14)).sub(tracks.mul(.22))); r.subAssign(s.mul(.16).add(tracks.mul(.06)));
    });
  });
  return vec4(max(c, 0), clamp(r, .05, 1));
}

// the stamps' uniforms (ground-paint.js's STAMP_U: the same arrays, set for each strip)
let ST = null;
const stampNodes = U => ST ||= { A: uniformArray(U.gpStampA.value, 'vec4'), B: uniformArray(U.gpStampB.value, 'vec4'), C: uniformArray(U.gpStampC.value, 'vec4'), n: uniform(0, 'int').onRenderUpdate(() => U.gpStampN.value) };
function paintMat(pm, U) {
  const m = new MeshBasicNodeMaterial(); m.depthTest = false; m.depthWrite = false; m.blending = NoBlending; m.toneMapped = false; m.fog = false; m.side = DoubleSide;   // (both sides: the camera paints upside down)
  const St = stampNodes(U), g = Fn(() => paint(positionWorld.xz.add(ORG.xz), vec3(pm.col.r, pm.col.g, pm.col.b), float(pm.k), St))().toVar();
  m.fragmentNode = vec4(sqrt(g.rgb), g.a);   // (colour as its square root, roughness in the alpha)
  m.name = 'ground paint';
  return m;
}

/** Paints pieces of a level's picture (ground-paint.js paint(): [c0, r0, width, height, world x0, x1, z0, z1], rows counted along -z). */
let state;
export function groundPaintRender(r, gp, L, pieces, U, load) {
  const rt = L.rt, N = L.px;
  state = RendererUtils.resetRendererAndSceneState(r, gp.scene, state);
  for (const s of gp.surfaces) { const pm = s.p.userData.paint; s.p.material = pm.gpu ||= paintMat(pm, U); }
  try {
    r.autoClear = false;
    pieces.forEach((q, i) => {
      // (on WebGPU a picture's rows count from the top, the viewport's too, and three reads it as it is: the camera is
      // turned upside down so that each texel holds the same ground as on WebGL, where the rows count from the bottom)
      load(q[8]); gp.aim(q); const c = gp.cam, t = c.top; c.top = c.bottom; c.bottom = t; c.updateProjectionMatrix();
      rt.viewport.set(q[0], q[1], q[2], q[3]); rt.scissor.copy(rt.viewport); rt.scissorTest = true;
      rt.texture.mipmapsAutoUpdate = i === pieces.length - 1;
      r.setRenderTarget(rt); r.render(gp.scene, gp.cam);
    });
  } finally {
    rt.viewport.set(0, 0, N, N); rt.scissor.set(0, 0, N, N); rt.scissorTest = false; rt.texture.mipmapsAutoUpdate = true;
    RendererUtils.restoreRendererAndSceneState(r, gp.scene, state);
  }
}

// a stand-in until the pictures are made. Filtered as the pictures are (three's DataTexture is nearest-filtered by
// default, which WebGPU reads without a sampler, by whole texels and with no wrapping): a ground material whose
// shader was written while it read this one kept that way of reading after the pictures came in, and read one
// texel off their edge for the whole road (Parcel Dash on Rob's Fold, 2026-11-15: roads brown, black or grey on a first load).
let blank = null;
const BLANK = () => blank ||= Object.assign(new DataTexture(new Uint8Array([128, 128, 128, 230]), 1, 1), { minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false, needsUpdate: true });

/** The 'groundpaint' look (hd3d-gpu.js gpuLooks): m: the ground's material (still a classic one); s: its look; live: hd3d-gpu.js's. */
export function groundPaintLook(m, s, o, { live }) {
  if (!s) return;
  const u = s.uniforms, L = live(u.gpL), L2 = live(u.gpL2), on = live(u.gpOn);
  const pic = k => texture(u[k].value || BLANK()).onRenderUpdate(() => u[k].value || undefined);
  const T0 = pic('gpT0'), T1 = pic('gpT1');
  // (the painted colour is tinted by this material's own colour: a reference to it, not to whichever material is
  // drawing, since a shadow pass draws it with three's shadow material, which has no colour, and reads this node's alpha)
  const col = reference('color', 'color', m);
  const own = m.colorNode ? vec4(m.colorNode) : materialColor, ownRough = m.roughnessNode ? float(m.roughnessNode) : materialRoughness;
  // where this is: how far into the fine level's edge (w0: 0 inside, 1 past it) and the coarse one's (w1), and so how
  // much of the pictures it takes (k; only a face that looks up). Each change is a smooth blend of the two over the
  // band, never a dither: a dither shows wherever the two differ at all, the coarse level's colour and roughness being
  // the fine one's averaged over bigger texels, and an upscaler grows it into speckles of the sky's reflection (Parcel
  // Dash on Rob's Fold, 2026-11-15: "a square around me on the road that follows me").
  const gp = positionWorld.xz.add(ORG.xz).toVar('gsGpW');
  const m0 = max(abs(gp.x.sub(L.x)), abs(gp.y.sub(L.y))).div(L.z.mul(.5)), m1 = max(abs(gp.x.sub(L2.x)), abs(gp.y.sub(L2.y))).div(L.w.mul(.5));
  const w0 = smoothstep(.8, .95, m0).toVar('gsGpW0'), w1 = smoothstep(.82, .97, m1);
  const k = select(on.greaterThan(.5).and(normalWorldGeometry.y.greaterThan(.7)), float(1).sub(w1), float(0)).toVar('gsGpK');
  // what the pictures say here: colour (linear) and roughness, the two levels blended
  const G = Fn(() => {
    const gq = vec2(gp.x, gp.y.negate()).toVar(), gx = dFdx(gq).toVar(), gy = dFdy(gq).toVar();   // (the pictures' v runs along -z)
    const g = vec4(0, 0, 0, 1).toVar();
    If(k.greaterThan(0), () => {
      If(w0.lessThan(1), () => { const a = T0.sample(gq.div(L.z)).grad(gx.div(L.z), gy.div(L.z)); g.assign(vec4(a.rgb.mul(a.rgb), a.a)); });
      If(w0.greaterThan(0), () => { const b = T1.sample(gq.div(L.w)).grad(gx.div(L.w), gy.div(L.w)); g.assign(mix(g, vec4(b.rgb.mul(b.rgb), b.a), w0)); });
    });
    return g;
  })().toVar('gsGpG');
  m.colorNode = mix(own, vec4(col.mul(G.rgb), 1), k);
  m.roughnessNode = mix(ownRough, G.a, k);
  // what the puddles read (hd3d-gpu.js gpuWet; ground-paint.js READ's gsGroove): darker than the ground round it here (a joint,
  // a crack: water stays in it), or lighter (paint: a little proud), from the fine level and one more read of it a few mips down
  m.userData.gsGroove = Fn(() => {
    const gv = float(0).toVar(), gq = vec2(gp.x, gp.y.negate()).toVar(), gx = dFdx(gq).toVar(), gy = dFdy(gq).toVar();   // (derivatives outside the branch: WGSL)
    If(k.greaterThan(0).and(w0.lessThan(1)), () => {
      const a = T0.sample(gq.div(L.z)).grad(gx.div(L.z), gy.div(L.z)).rgb, ab = T0.sample(gq.div(L.z)).grad(gx.div(L.z).mul(6), gy.div(L.z).mul(6)).rgb;
      const l = dot(a, vec3(.3, .5, .2)).div(max(dot(ab, vec3(.3, .5, .2)), .02)).toVar();
      gv.assign(smoothstep(.88, .55, l).sub(smoothstep(1.15, 1.5, l)).mul(w0.oneMinus()).mul(k));
    });
    return gv;
  })().toVar('gsGpGroove');
}
