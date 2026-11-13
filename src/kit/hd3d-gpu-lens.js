// A camera like a real lens, drawn on WebGPU (v.lens; the numbers come from lens.js).
//
// Depth of field as the big engines draw it, at a quarter of the pixels (half the width and height):
//  1. prefilter: each half-size pixel's colour and its signed circle of confusion (CoC, in half-size pixels: below
//     nought nearer than the focus, above it further), the nearest of its four pixels deciding. A point much
//     brighter than its surroundings and above the screen's white is lifted out of it into a picture of its own:
//     those are drawn as discs (5), so a lamp or a glint out of focus is a clean round (or bladed) bokeh disc, not
//     the speckle a gather makes of one bright pixel.
//  2. near tiles: the widest near blur in each 8 x 8 block, spread to its neighbours, so a soft thing in front
//     spills over the sharp things behind its edge, as a real lens shows it.
//  3. gather: 48 taps on a spiral (Vogel's, shaped by the aperture's blades). A tap counts where its own blur
//     reaches this pixel (scatter as gather); what is behind a sharper thing can't spread over it; taps from
//     soft things in front build a near layer of their own, with how much of this pixel they cover (each tap's
//     share of its own disc), so out of focus foreground edges are see-through as they should be.
//  4. sprites: one quad for each 2 x 2 block of the half-size picture (a sixteenth of the pixels), shrunk to
//     nothing unless the block holds a lifted bright point; its light is spread evenly over its disc (the
//     energy kept), hidden where something sharp stands in front of it.
//  5. composite, at full size: the sharp picture, the gathered blur by how soft each pixel is, the near layer
//     over it, and the discs added on top. It takes the place of the chain's picture from here on.
// And the autofocus: the distance at nine points round `spot`, packed into bytes for the view to read back
// (lens.js afTake takes their median).
//
// Kit use only (hd3d-gpu.js).
import { Node, QuadMesh, NodeMaterial, RendererUtils, RenderTarget, HalfFloatType, UnsignedByteType, Vector2, Vector4, Mesh, InstancedBufferGeometry, Float32BufferAttribute, AdditiveBlending, OrthographicCamera } from 'three/webgpu';
import {
  Fn, NodeUpdateType, uniform, uniformArray, uv, vec2, vec3, vec4, float, min, max, abs, clamp, mix, select, dot, cos, sin, mod, floor, smoothstep, length, atan,
  passTexture, texture, context, outputStruct, property, Loop, If, instanceIndex, varying, positionGeometry, screenUV, log2,
} from 'three/tsl';
import { AF_LOG } from './lens.js';

const Q = new QuadMesh(), CAM = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
let RS;   // (three fills it in: undefined, not null, the first time)
const N = 48, LUM = vec3(.2126, .7152, .0722), TILE = 8;
// the gather's taps: Vogel's spiral (golden angle turns, radius by the square root, so they cover the disc evenly)
const KER = Array.from({ length: N }, (_, i) => { const a = i * 2.39996323, r = Math.sqrt((i + .5) / N); return new Vector4(Math.cos(a), Math.sin(a), r, a); });
const rt = (o = {}) => { const t = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType, ...o }); return t; };
const qmat = (node, name) => { const m = new NodeMaterial(); m.name = name; m.fragmentNode = node; return m; };

export class LensNode extends Node {
  static get type() { return 'LensNode'; }
  /** src: the picture so far; ao: its ambient occlusion factor (or 1); depth: the scene's depth picture. */
  constructor(src, ao, depth) {
    super('vec4');
    this.updateBeforeType = NodeUpdateType.FRAME;
    Object.assign(this, { src, ao, depth });
    // lens: K (half-size pixels of blur per dioptre), D (the focus, dioptres), the widest blur (half-size pixels), the highlight's brightness;
    // shape: blades (0 round), their turn, how strong the discs are, on (0: the picture passes through); near / far: the camera's
    this.U = { lens: uniform(new Vector4()), shape: uniform(new Vector4()), cn: uniform(.1), cf: uniform(1000), px: uniform(new Vector2(1, 1)), hpx: uniform(new Vector2(1, 1)), tpx: uniform(new Vector2(1, 1)),
      grid: uniform(new Vector2(1, 1)), af: uniform(new Vector4(.5, .5, .02, .02)) };
    this.pre = rt({ count: 2 }); this.tile = rt(); this.dil = rt(); this.gat = rt({ count: 2 }); this.spr = rt(); this.out = rt(); this.afRT = new RenderTarget(3, 3, { depthBuffer: false, type: UnsignedByteType });
    for (const t of [this.pre, this.tile, this.dil, this.gat, this.spr, this.out]) t.gsPart = 'depth of field';
    this.pre.textures[0].name = 'Lens colour'; this.pre.textures[1].name = 'Lens highlights'; this.gat.textures[0].name = 'Lens blur'; this.gat.textures[1].name = 'Lens near'; this.spr.texture.name = 'Lens bokeh'; this.out.texture.name = 'Lens';
    this.mats = {};
    this.outN = passTexture(this, this.out.texture);
    // the bokeh discs: one quad per 2 x 2 block of the half-size picture
    const g = this.spG = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.instanceCount = 1;
    // (pw, ph: not w and h, which on a node are the swizzles of a vector)
    this.on = false; this.afOn = false; this.pw = 0; this.ph = 0;
  }
  getTextureNode() { return this.outN; }
  /** This frame's numbers (lens.js lensFrame), null to let the picture pass; near / far: the camera's; ph: the picture's height. */
  set(L, near, far, ph) {
    const U = this.U; this.on = !!L;
    U.cn.value = near; U.cf.value = far;
    if (!L) { U.shape.value.w = 0; this.afOn = false; return; }
    U.lens.value.set(L.K * ph / 2, L.D, Math.max(.5, L.max * ph / 2), L.hi); U.shape.value.set(L.blades, L.turn, L.bokeh, 1);
    this.afOn = !!L.afWant; if (this.afOn) U.af.value.set(L.spot[0], L.spot[1], .025 * ph / Math.max(1, this.pw || ph), .025);
  }
  updateBefore(frame) {
    const r = frame.renderer, img = this.src.value?.image, w = img?.width | 0, h = img?.height | 0;
    if (!w || !h) return;
    const U = this.U, hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), tw = Math.ceil(hw / TILE), th = Math.ceil(hh / TILE), qw = Math.ceil(hw / 2), qh = Math.ceil(hh / 2);
    if (w !== this.pw || h !== this.ph) {
      this.pw = w; this.ph = h; this.out.setSize(w, h);
      for (const t of [this.pre, this.gat, this.spr]) t.setSize(hw, hh);
      this.tile.setSize(tw, th); this.dil.setSize(tw, th);
      U.px.value.set(1 / w, 1 / h); U.hpx.value.set(1 / hw, 1 / hh); U.tpx.value.set(1 / tw, 1 / th); U.grid.value.set(qw, qh); this.spG.instanceCount = qw * qh;
    }
    const M = this.mats;
    RS = RendererUtils.resetRendererState(r, RS);
    try {
      r.setClearColor(0x000000, 0);
      const go = (m, t) => { r.setRenderTarget(t); Q.material = m; Q.name = m.name; Q.render(r); };
      if (this.on) {
        go(M.pre, this.pre); go(M.tile, this.tile); go(M.dil, this.dil); go(M.gat, this.gat);
        // (the discs and the autofocus are drawn whether wanted or not: nine pixels, and quads that shrink to nothing,
        // so their shaders are built with the rest when the lens first comes on, not in the middle of play)
        r.setRenderTarget(this.spr); r.render(this.spM, CAM);
        go(M.af, this.afRT);
      }
      go(M.comp, this.out);
    } finally { RendererUtils.restoreRendererState(r, RS); }
  }
  /** The autofocus texels back, without waiting (3 x 3, see lens.js afTake). */
  readAF(r) { return r.readRenderTargetPixelsAsync(this.afRT, 0, 0, 3, 3); }
  setup(builder) {
    // (what this reads is drawn first: the scene's pass, the effects before this one)
    this.depth.build(builder); this.src.build(builder); if (!this.ao.isConstNode) this.ao.build(builder);
    const ctx = context(builder.getSharedContext()), U = this.U, S = this.src, SA = this.ao, dT = this.depth;
    const P0 = texture(this.pre.textures[0]), P1 = texture(this.pre.textures[1]), TL = texture(this.tile.texture), DL = texture(this.dil.texture);
    const G0 = texture(this.gat.textures[0]), G1 = texture(this.gat.textures[1]), SP = texture(this.spr.texture);
    const L = U.lens, B = U.shape;
    // 1 / distance is a straight line in the depth picture's value; the sky is at no 1 / distance at all
    const invZ = d => select(d.greaterThanEqual(1), float(0), float(1).div(U.cn).sub(d.mul(float(1).div(U.cn).sub(float(1).div(U.cf)))));
    const cocAt = d => clamp(L.x.mul(L.y.sub(invZ(d))), L.z.negate(), L.z);   // (half-size pixels, signed)
    // the aperture's outline: how far out its edge is at angle a (1 round; a polygon of `blades` sides, turned)
    const shapeAt = a => { const n = max(B.x, 3), s = float(Math.PI).div(n); return select(B.x.lessThan(3), float(1), cos(s).div(cos(mod(a.sub(B.y), s.mul(2)).sub(s)))); };
    const own = m => { m.contextNode = ctx; m.needsUpdate = true; return m; };

    // 1. prefilter (MRT: the colour to gather with its CoC, and the lifted highlights)
    {
      const c0 = property('vec4'), c1 = property('vec4');
      const m = own(new NodeMaterial()); m.name = 'Lens prefilter';
      m.colorNode = Fn(() => {
        const q = uv(), o = U.px.mul(.5), col = vec3(0).toVar(), coc = float(1e4).toVar();
        for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = q.add(o.mul(vec2(i, j))); col.addAssign(S.sample(p).rgb); coc.assign(min(coc, cocAt(dT.sample(p).r))); }
        const c = col.mul(.25).mul(SA).toConst();
        let sl = float(0); for (const [i, j] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) sl = sl.add(dot(S.sample(q.add(U.px.mul(vec2(i, j)))).rgb, LUM));
        const l = dot(c, LUM), T = max(L.w, sl.mul(.25).mul(SA).mul(3));
        const ex = c.mul(max(l.sub(T), 0).div(max(l, 1e-6))).mul(select(abs(coc).greaterThanEqual(1.5).and(B.z.greaterThan(0)), float(1), float(0))).toConst();
        c0.assign(vec4(c.sub(ex), coc)); c1.assign(vec4(ex, 1));
        return float(0);
      })();
      m.outputNode = outputStruct(c0, c1); this.mats.pre = m;
    }
    // 2. near tiles: the widest near blur in each block (16 taps over 8 x 8), then spread over 5 x 5 blocks
    this.mats.tile = own(qmat(Fn(() => {
      const q = uv(), lo = float(0).toVar();
      for (const i of [-3, -1, 1, 3]) for (const j of [-3, -1, 1, 3]) lo.assign(min(lo, P0.sample(q.add(U.hpx.mul(vec2(i, j)))).a));
      return vec4(lo.negate(), 0, 0, 1);
    })(), 'Lens near tiles'));
    this.mats.dil = own(qmat(Fn(() => {
      const q = uv(), hi = float(0).toVar();
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) hi.assign(max(hi, TL.sample(q.add(U.tpx.mul(vec2(i, j)))).r));
      return vec4(hi, 0, 0, 1);
    })(), 'Lens near spread'));
    // 3. gather (MRT: this pixel's own blur with how much a near layer covers it, and that near layer's colour)
    {
      const ker = uniformArray(KER), g0 = property('vec4'), g1 = property('vec4');
      const m = own(new NodeMaterial()); m.name = 'Lens gather';
      m.colorNode = Fn(() => {
        const q = uv(), c0 = P0.sample(q), coc0 = c0.a.toConst(), R = clamp(max(abs(coc0), DL.sample(q).r), 0, L.z).toConst();
        const bg = vec3(c0.rgb).toVar(), bw = float(1).toVar(), nc = vec3(0).toVar(), na = float(0).toVar();
        If(R.greaterThan(.5), () => {
          Loop(N, ({ i }) => {
            const k = ker.element(i), r = R.mul(k.z), o = k.xy.mul(r.mul(shapeAt(k.w))).mul(U.hpx);
            const s = P0.sample(q.add(o)).level(0), cs = abs(s.a);
            // (what is further than this pixel spreads over it no wider than twice this pixel's own blur: a sharp
            // thing isn't covered by the soft background behind it)
            const reach = clamp(select(s.a.greaterThan(coc0), min(cs, abs(coc0).mul(2)), cs).sub(r).add(.5), 0, 1);
            const near = s.a.lessThan(min(coc0.sub(1), -.5));
            const wn = select(near, reach.mul(R.mul(R)).div(max(s.a.mul(s.a), 1)), float(0));
            nc.addAssign(s.rgb.mul(wn)); na.addAssign(wn);
            bg.addAssign(mix(bg.div(bw), s.rgb, select(near, float(0), reach))); bw.addAssign(1);
          });
        });
        g0.assign(vec4(bg.div(bw), clamp(na.div(N), 0, 1))); g1.assign(vec4(nc.div(max(na, 1e-5)), 1));
        return float(0);
      })();
      m.outputNode = outputStruct(g0, g1); this.mats.gat = m;
    }
    // 4. the bokeh discs
    {
      const m = new NodeMaterial(); m.name = 'Lens bokeh'; m.transparent = true; m.blending = AdditiveBlending; m.depthTest = m.depthWrite = false;
      const id = float(instanceIndex), gx = mod(id, U.grid.x), gy = floor(id.div(U.grid.x)), c = vec2(gx.add(.5), gy.add(.5)).div(U.grid);
      const e = P1.sample(c).level(0).rgb.mul(4), coc = P0.sample(c).level(0).a, rho = abs(coc);
      const show = rho.greaterThanEqual(1.5).and(dot(e, LUM).greaterThan(1e-5)), size = rho.add(1);
      const nb = max(B.x, 3), area = select(B.x.lessThan(3), float(Math.PI), nb.mul(.5).mul(sin(float(2 * Math.PI).div(nb))));   // (a polygon's area, its corners 1 out)
      const vLocal = varying(positionGeometry.xy.mul(vec2(1, -1)).mul(size)), vCol = varying(e.div(area.mul(max(rho.mul(rho), 1))).mul(B.z)), vCoc = varying(coc);
      m.vertexNode = select(show, vec4(c.x.mul(2).sub(1).add(positionGeometry.x.mul(size).mul(U.hpx.x).mul(2)), c.y.mul(-2).add(1).add(positionGeometry.y.mul(size).mul(U.hpx.y).mul(2)), .5, 1), vec4(2, 2, 2, 1));
      m.fragmentNode = Fn(() => {
        const rr = length(vLocal), edge = abs(vCoc).mul(shapeAt(atan(vLocal.y, vLocal.x)));
        const a = clamp(edge.sub(rr).add(.5), 0, 1);
        // (a far disc is hidden where something clearly nearer stands: the in-focus thing in front of a lamp)
        const tol = max(vCoc.mul(.25), 1), pix = P0.sample(screenUV).a;
        const vis = select(vCoc.greaterThan(0), smoothstep(vCoc.sub(tol.mul(2)), vCoc.sub(tol), pix), float(1));
        return vec4(vCol.mul(a).mul(vis), 1);
      })();
      own(m); const mesh = this.spM = new Mesh(this.spG, m); mesh.frustumCulled = false; mesh.name = 'Lens bokeh';
    }
    // 5. composite, at full size
    this.mats.comp = own(qmat(Fn(() => {
      const q = uv(), base = S.sample(q).rgb.mul(SA).toConst();
      const out = vec3(base).toVar();
      If(B.w.greaterThan(.5), () => {
        const coc = cocAt(dT.sample(q).r), g0 = G0.sample(q), g1 = G1.sample(q);
        const self = mix(base, g0.rgb, smoothstep(.25, 1, abs(coc)));
        out.assign(mix(self, g1.rgb, g0.a).add(SP.sample(q).rgb));
      });
      return vec4(out, 1);
    })(), 'Lens composite'));
    // the autofocus: the distance at nine points round the spot, as log2(metres) in two bytes, and the sky
    this.mats.af = own(qmat(Fn(() => {
      const q = uv(), p = U.af.xy.add(q.sub(.5).mul(2).mul(U.af.zw)), d = dT.sample(p).r, iz = invZ(d);
      const n = clamp(log2(float(1).div(max(iz, 1e-7))).sub(AF_LOG[0]).div(AF_LOG[1]), 0, 1).mul(65535), hi = floor(n.div(256));
      return vec4(hi.div(255), n.sub(hi.mul(256)).div(255), select(d.greaterThanEqual(1), float(1), float(0)), 1);
    })(), 'Lens autofocus'));
    return this.outN;
  }
  dispose() {
    super.dispose();
    for (const t of [this.pre, this.tile, this.dil, this.gat, this.spr, this.out, this.afRT]) t.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.spM?.material.dispose(); this.spG.dispose();
  }
}
