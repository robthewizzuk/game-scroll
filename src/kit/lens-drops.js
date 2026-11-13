// Rain on the lens (a Next Gen view's v.drops): drops that land on the camera's glass while it rains and the
// camera looks out under the open sky, more when it faces up or into the wind. Each one bends what is behind it
// (upside down and squeezed, as a drop does), is darker at its rim with a glint near its top, and the big ones
// slide down before they dry. Drawn in the final pass, in one loop over at most 16 drops, on WebGL (hd3d.js
// FINAL_EFFECTS 'drops') and on WebGPU (hd3d-gpu.js GpuChain); a lens that is dry costs a loop that stops at once.
// gs.sky.Weather lands them by itself (its option lens: false keeps the lens dry); v.drops.add() is a splash of
// your own, v.drops.clear() wipes the lens. Kit use only.
import { Vector4 } from 'three';
import { Fn, Loop, If, Break, vec2, vec3, float, dot, sqrt, smoothstep, mix, clamp, length } from 'three/tsl';

export const DROPS_N = 16;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class LensDrops {
  constructor() {
    this.on = false;   // (true once something may land drops: the shaders are built with the loop in, so none is built mid-game)
    this.list = []; this.vecs = Array.from({ length: DROPS_N }, () => new Vector4()); this.n = 0; this.owed = 0; this.seed = 7919;
  }
  rnd() { return (this.seed = (this.seed * 16807) % 2147483647) / 2147483647; }
  /** A drop on the lens at x, y (0..1 across and up the screen), r its radius as a part of the screen's height; any left out are picked at random. */
  add(x, y, r) {
    const R = () => this.rnd(), big = R() < .25;
    if (this.list.length >= DROPS_N) this.list.shift();   // (the oldest gives way)
    const rr = r ?? (big ? .05 + R() * .04 : .018 + R() * .025);
    this.list.push({ x: x ?? R(), y: y ?? R(), r: rr, age: 0, life: 3 + R() * 6, slide: rr > .055 ? .03 + R() * .06 : 0, wob: R() * 6.28 });
    this.on = true; return this;
  }
  /** Seconds since the last call, and how many drops land a second now. */
  update(dt, rate = 0) {
    this.owed += Math.max(0, rate) * dt;
    while (this.owed >= 1) { this.owed -= 1; this.add(); }
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i]; d.age += dt;
      if (d.slide) { d.y -= d.slide * dt * Math.min(1, d.age); d.x += Math.sin(d.age * 3 + d.wob) * .004 * dt; }
      if (d.age > d.life || d.y < -d.r) L.splice(i, 1);
    }
    this.n = L.length;
    for (let i = 0; i < L.length; i++) { const d = L[i], a = Math.min(1, d.age / .08) * (1 - smooth(d.life - 1.6, d.life, d.age)); this.vecs[i].set(d.x, d.y, d.r * (1 - .25 * d.age / d.life), a); }
    return this;
  }
  /** Wipes the lens. */
  clear() { this.list.length = 0; this.n = 0; this.owed = 0; return this; }
  get count() { return this.n; }
}

// WebGL: the final pass's piece (vUv, aspect, tex(), tBloom and bloom are the pass's own; col is the colour so far)
export const DROPS_HEAD = `  #ifdef DROPS
  uniform vec4 drops[${DROPS_N}]; uniform float dropN;
  #endif
`;
export const DROPS_GLSL = `  #ifdef DROPS
    for (int i = 0; i < ${DROPS_N}; i++) {
      if (float(i) >= dropN) break;
      vec4 dr = drops[i]; vec2 q = (vUv - dr.xy) * vec2(aspect, 1.) / dr.z; float l2 = dot(q, q);
      if (l2 < 1.) {   // (what is behind, upside down and squeezed, darker at the rim, a glint near the top)
        float l = sqrt(l2), a = dr.w * smoothstep(1., .82, l); vec2 ru = clamp(dr.xy - q * dr.z * vec2(1. / aspect, 1.) * 1.7, 0., 1.);
        vec3 c = (tex(ru) + texture2D(tBloom, ru).rgb * bloom) * mix(1., .45, smoothstep(.55, 1., l)) + smoothstep(.32, .08, length(q - vec2(-.3, .38))) * .35;
        col = mix(col, c, a);
      }
    }
  #endif
`;
// WebGPU: the same over a colour node. uv: the screen's (y down); sample(p): the scene's colour at p (y down); U: { drops, dropN, aspect }
export function dropsNode(col, uv, sample, U) {
  return Fn(() => {
    const out = vec3(col).toVar(), p = vec2(uv.x, uv.y.oneMinus());
    Loop(DROPS_N, ({ i }) => {
      If(float(i).greaterThanEqual(U.dropN), () => { Break(); });
      const dr = U.drops.element(i), q = p.sub(dr.xy).mul(vec2(U.aspect, 1)).div(dr.z), l2 = dot(q, q);
      If(l2.lessThan(1), () => {
        const l = sqrt(l2), a = dr.w.mul(smoothstep(1, .82, l)), ru = clamp(dr.xy.sub(q.mul(dr.z).mul(vec2(float(1).div(U.aspect), 1)).mul(1.7)), 0, 1);
        const c = sample(vec2(ru.x, ru.y.oneMinus())).mul(mix(float(1), float(.45), smoothstep(.55, 1, l))).add(smoothstep(.32, .08, length(q.sub(vec2(-.3, .38)))).mul(.35));
        out.assign(mix(out, c, a));
      });
    });
    return out;
  })();
}
