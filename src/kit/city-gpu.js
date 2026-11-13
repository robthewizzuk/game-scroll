// gs.city's looks on WebGPU, as nodes (hd3d-gpu.js gpuLooks): city-rooms.js's 'rooms' (the rooms behind
// every window). The same sums as the WebGL version: change both.
import { Fn, If, attribute, uv, texture, positionView, normalViewGeometry, cameraViewMatrix, materialMetalness, materialRoughness, materialEmissive,
  vec2, vec3, vec4, float, floor, fract, mod, abs, min, max, clamp, dot, cross, normalize, smoothstep, step, sin, select, mix } from 'three/tsl';

const hash = p => { const a = fract(vec3(p.x, p.y, p.x).mul(.1031)), b = a.add(dot(a, a.yzx.add(33.33))); return fract(b.x.add(b.y).mul(b.z)); };
const pick = (k, a, b, c, d) => select(k.lessThan(.25), vec3(...a), select(k.lessThan(.5), vec3(...b), select(k.lessThan(.75), vec3(...c), vec3(...d))));
const tOf = (o, d, lo, hi) => select(d.greaterThan(1e-5), hi.sub(o).div(d), select(d.lessThan(-1e-5), lo.sub(o).div(d), float(1e6)));
const near = (a, b) => abs(a.sub(b)).lessThan(.5);

/** m: a facade's material (still a classic one); s: its look; o: the mesh; afterColor, live: hd3d-gpu.js's. */
export function roomsLook(m, s, o, { afterColor, live }) {
  const u = s.uniforms, W = live(u.gsRmWin), SH = live(u.gsRmShape), LK = live(u.gsRmLook), TR = live(u.gsRmTrim), GL = live(u.gsRmGlass), LT = live(u.gsRmLight);
  const R = attribute('gsRoom', 'vec4'), em = m.emissiveMap;
  const dist = positionView.length(), fade = float(1).sub(smoothstep(LK.w.mul(.66), LK.w, dist));
  // what the eye meets at this pixel: (the room's glow behind the glass, a code: which surface * 2 + a number for it)
  const Q = Fn(() => {
    const E = vec3(0).toVar(), code = float(0).toVar();
    const U = uv().mul(SH.xy), cell = floor(U), c = U.sub(cell), ci = mod(cell, SH.xy), kind = LK.x;
    const skip = near(kind, 2).and(mod(ci.x.mul(7).add(ci.y.mul(3)), 5).greaterThan(2.5)).or(near(kind, 3).and(abs(mod(ci.x.add(ci.y), 3).sub(1)).lessThan(.5)));
    const inWin = c.x.greaterThan(W.x).and(c.x.lessThan(W.z)).and(c.y.greaterThan(W.y)).and(c.y.lessThan(W.w));
    If(R.w.greaterThan(.5).and(fade.greaterThan(0)).and(R.x.greaterThan(0)).and(skip.not()).and(inWin), () => {
      const V = normalize(positionView), N = normalize(normalViewGeometry), Up = normalize(cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz), T = normalize(cross(Up, N));
      const d = vec3(dot(V, T).div(R.x), dot(V, Up).div(R.y), max(dot(V, N).negate(), .03)).toVar();
      const rv = SH.z, D = SH.w, tx = tOf(c.x, d.x, W.x, W.z).toVar(), ty = tOf(c.y, d.y, W.y, W.w).toVar(), tG = rv.div(d.z);
      If(min(tx, ty).lessThan(tG), () => {   // the hole's side
        const sh = select(tx.lessThan(ty), float(.6), select(d.y.greaterThan(0), float(.4), float(.88)));
        code.assign(float(2).add(sh.mul(float(1).sub(min(tx, ty).mul(d.z).div(rv).mul(.35)))));
      }).Else(() => {
        const g = c.add(d.xy.mul(tG)).toVar(), fw = LK.z, fy = fw.mul(R.x).div(R.y);
        const frEdge = g.x.lessThan(W.x.add(fw)).or(g.x.greaterThan(W.z.sub(fw))).or(g.y.lessThan(W.y.add(fy))).or(g.y.greaterThan(W.w.sub(fy)));
        const bar = kind.lessThan(.5).or(near(kind, 2)).and(abs(g.x.sub(W.x.add(W.z).mul(.5))).lessThan(fw.mul(.45)));
        const transom = near(kind, 1).or(near(kind, 4)).and(abs(g.y.sub(W.y.add(W.w.sub(W.y).mul(.8)))).lessThan(fy.mul(.45)));
        If(frEdge.or(bar).or(transom), () => { code.assign(4); }).Else(() => {
          const sd = R.z, r1 = hash(cell.add(sd.mul(7.13))), r2 = hash(cell.yx.mul(1.3).add(sd.mul(3.7)).add(11)), r3 = hash(cell.mul(1.7).add(sd).add(23)), r4 = hash(cell.mul(.7).add(sd.mul(1.9)).add(41));
          const shop = near(kind, 4), office = near(kind, 1);
          const lamp = em ? texture(em, floor(U).add(vec2(W.x.add(W.z).mul(.5), W.y.add(W.w).mul(.5))).div(SH.xy)).level(0).rgb : vec3(0);
          const lit = select(shop, float(1), step(.004, dot(lamp, vec3(.3, .59, .11))));
          const lc = select(shop, vec3(1, .95, .86), lamp.div(max(max(lamp.r, max(lamp.g, lamp.b)), 1e-3)));
          const twx = tOf(g.x, d.x, float(0), float(1)), twy = tOf(g.y, d.y, float(0), float(1)), tb = D.div(d.z);
          const t = min(min(twx, twy), tb).toVar(), h = vec3(g.add(d.xy.mul(t)), d.z.mul(t)).toVar();
          const wall = select(office, vec3(.62, .62, .6), pick(r1, [.66, .6, .5], [.52, .58, .6], [.68, .66, .6], [.56, .5, .44]));
          const col = vec3(0).toVar(), pan = float(0).toVar();
          If(tb.lessThanEqual(min(twx, twy)), () => {   // the back wall
            col.assign(wall);
            If(shop, () => {
              const row = floor(h.y.mul(5)), sy = fract(h.y.mul(5)), n = floor(hash(vec2(row, r1.mul(9))).mul(7)).add(4), q = hash(vec2(floor(h.x.mul(n)), row).add(r1.mul(17)));
              const goods = pick(fract(q.mul(7.3)), [.7, .3, .2], [.3, .45, .62], [.8, .7, .36], [.4, .55, .34]).mul(fract(q.mul(13.1)).mul(.35).add(.45));
              col.assign(select(sy.lessThan(.1), vec3(.3, .26, .22), select(sy.greaterThan(q.mul(.6).add(.3)).or(fract(h.x.mul(n)).lessThan(.07)), wall.mul(.4), goods)));
            }).ElseIf(r2.lessThan(.35).and(abs(h.x.sub(r3.mul(.6).add(.2))).lessThan(.11)).and(h.y.lessThan(.72)), () => { col.mulAssign(.35); })
              .ElseIf(r2.greaterThan(.6).and(abs(h.x.sub(r4.mul(.5).add(.25))).lessThan(.13)).and(abs(h.y.sub(.55)).lessThan(.1)), () => { col.assign(pick(r3, [.3, .4, .5], [.6, .4, .3], [.3, .45, .3], [.7, .65, .5]).mul(.8)); });
          }).ElseIf(twx.lessThan(twy), () => { col.assign(wall.mul(.84)); })
            .ElseIf(d.y.lessThan(0), () => {
              col.assign(select(office, vec3(.3, .32, .34), pick(r3, [.42, .29, .18], [.36, .33, .3], [.5, .4, .3], [.3, .32, .38])));
              If(office.not().and(r3.lessThan(.25)), () => { col.mulAssign(step(.5, fract(h.x.mul(7))).mul(.15).add(.85)); });
            }).Else(() => {
              col.assign(vec3(.74, .73, .7));
              pan.assign(select(office.or(shop), step(abs(fract(h.z.mul(.42)).sub(.5)), .16).mul(step(abs(fract(h.x.mul(2)).sub(.5)), .2)), float(1).sub(smoothstep(.04, .1, vec2(h.x.sub(.5), h.z.div(D).sub(.45)).length()))));
            });
          // something standing in the room
          const zf = D.mul(r3.mul(.3).add(.32)), tf = zf.div(d.z);
          If(tf.lessThan(t), () => {
            const f = g.add(d.xy.mul(tf)), x0 = r4.mul(.45).add(.08), x1 = x0.add(r1.mul(.25)).add(.3), top = select(office, float(.23), select(shop, float(.3), r2.mul(.25).add(.2)));
            If(f.x.greaterThan(x0).and(f.x.lessThan(x1)).and(f.y.lessThan(top)), () => {
              col.assign(select(office, vec3(.22, .2, .19), pick(r4, [.45, .2, .16], [.2, .26, .36], [.4, .36, .3], [.24, .3, .22]))); h.assign(vec3(f, zf)); pan.assign(0);
            }).ElseIf(office.and(f.x.greaterThan(x0.add(.08))).and(f.x.lessThan(x0.add(.22))).and(f.y.greaterThan(top)).and(f.y.lessThan(top.add(.1))), () => { col.assign(vec3(.04)); h.assign(vec3(f, zf)); pan.assign(0); });
          });
          const day = LT.x.mul(float(1.15).sub(clamp(h.z.div(D), 0, 1).mul(.75)));
          const night = lit.mul(select(shop, max(LT.y, .3).mul(1.8), LT.y.mul(select(office, float(1.1), float(1.2))))).mul(float(1).sub(abs(h.x.sub(.5)).mul(2)).mul(.45).add(.55)).mul(h.y.mul(.35).add(.65));
          const room = col.mul(vec3(day).add(lc.mul(night))).add(lc.mul(night).mul(pan).mul(1.5)).toVar();
          const gw = g.x.sub(W.x).div(W.z.sub(W.x)), gh = g.y.sub(W.y).div(W.w.sub(W.y));
          const cur = select(shop.not().and(r4.lessThan(.3)), r2.mul(.18).add(.12), float(0)), bl = select(shop.not().and(r4.greaterThan(.74)), r3.mul(.7), float(0));
          If(gw.lessThan(cur).or(gw.greaterThan(float(1).sub(cur))), () => {
            const cc = pick(r2, [.62, .55, .44], [.5, .2, .18], [.35, .42, .55], [.8, .78, .72]).mul(sin(gw.mul(70)).mul(.18).add(.82));
            room.assign(cc.mul(vec3(LT.x.mul(.9)).add(lc.mul(night).mul(.55))));
          }).ElseIf(gh.greaterThan(float(1).sub(bl)), () => {
            const bc = vec3(.82, .8, .74).mul(step(.5, fract(gh.mul(16))).mul(.14).add(.86));
            room.assign(bc.mul(vec3(LT.x.mul(.9)).add(lc.mul(night).mul(.5))));
          });
          E.assign(room.mul(LK.y)); code.assign(float(6).add(min(r3, .999)));
        });
      });
    });
    return vec4(E, code);
  })().toVar('gsRmQ');
  const kindOf = floor(Q.w.div(2)), v = Q.w.sub(kindOf.mul(2)), K = fade.mul(step(.5, kindOf));
  const C = select(kindOf.lessThan(1.5), TR.mul(v), select(kindOf.lessThan(2.5), TR.mul(.92), GL.rgb));
  // (mix(a, b, t) written out: TSL's chained t.mix(a, b) takes the blend first)
  afterColor(m, o, d0 => mix(d0, C, K));
  m.roughnessNode = mix(materialRoughness, select(kindOf.lessThan(1.5), float(.85), select(kindOf.lessThan(2.5), float(.5), v.mul(v).mul(.12).add(.05))), K);
  m.metalnessNode = mix(materialMetalness, GL.a, K.mul(step(2.5, kindOf)));
  m.emissiveNode = mix(materialEmissive, Q.xyz, K);
}
