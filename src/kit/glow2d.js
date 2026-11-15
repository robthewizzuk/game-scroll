// Light that glows (look2d Lights with glow: true): 2D radiance cascades on the graphics chip. Light
// leaves anything that glows (each light's small bright disc, and whatever the game paints with
// emit()), runs across the picture, stops at walls and soaks round their corners, so shadows are soft
// where a light is big and sharp where it is small, colours mix where lights meet, and a glowing
// shape lights the room in its own shape. Everything costs the same however many lights there are.
//
// How (Sannikov 2023, "Radiance Cascades"): the picture is covered with probes in cascades. Probes of
// cascade 0 are 2 texels apart and look 4 ways a short way out; each cascade up has probes twice as
// far apart that look 4 times as many ways, 4 times further. A probe's ray is traced (by a distance
// field of the walls, made by jump flooding) over its own stretch only, and what lies past that is
// taken from the cascade above: so far light is seen in many fine directions by few probes, near
// light in few directions by many, the way a penumbra needs. Merging goes from the top cascade down
// with the "bilinear fix": a ray is traced on to each of the four probes above it, not borrowed
// across a wall, so light doesn't leak through thin walls.
//
// WebGL2 (every phone that runs Game Scroll) with half-float pictures; where those aren't offered the
// Lights kit keeps its canvas lights. One context for every card (the feed has many), made on first
// use. Kit use only: games ask for it with new Lights(W, H, { glow: true }).
import { phoneClass } from './speed.js';

const MAXL = 48;   // lights a frame on the chip (the rest are left out)
let G = null, broken = false;

const VS = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
const HEAD = `#version 300 es
precision highp float; precision highp int;
out vec4 o;
`;

// the scene: what glows (rgb, as bright as it shines) and what blocks light (a); the game's canvas, then each light's disc
const SCENE = HEAD + `
uniform sampler2D src; uniform float bright; uniform int nl; uniform vec4 L[${MAXL}]; uniform vec4 C[${MAXL}];
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy); vec2 p = gl_FragCoord.xy;
  vec4 s = texelFetch(src, t, 0);
  o = vec4(s.rgb * bright * step(.5, s.a), step(.5, s.a));
  for (int i = 0; i < ${MAXL}; i++) {
    if (i >= nl) break;
    vec4 l = L[i]; vec2 d = p - l.xy; float r = length(d);
    if (r < l.z) { o = vec4(C[i].rgb, 1.); continue; }
    if (l.w > 0. && r < l.z + max(1.5, l.z * .7)) {   // a cone's hood: open only l.w either side of its way
      float a = atan(d.y, d.x) - C[i].w; a = abs(mod(a + 3.14159265, 6.2831853) - 3.14159265);
      if (a > l.w) o = vec4(0., 0., 0., 1.);
    }
  }
}`;
// jump flood: each texel finds the nearest blocking texel (its place, or -1 when none yet)
const SEED = HEAD + `
uniform sampler2D scene;
void main() { ivec2 t = ivec2(gl_FragCoord.xy); o = texelFetch(scene, t, 0).a > .5 ? vec4(vec2(t) + .5, 0., 1.) : vec4(-1e4, -1e4, 0., 1.); }`;
const JFA = HEAD + `
uniform sampler2D seed; uniform int k; uniform ivec2 size;
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy); vec2 p = vec2(t) + .5; vec2 best = vec2(-1e4); float bd = 1e9;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec2 q = t + ivec2(x, y) * k;
    if (q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y) continue;
    vec2 s = texelFetch(seed, q, 0).xy; float d = dot(s - p, s - p);
    if (s.x > -1e3 && d < bd) { bd = d; best = s; }
  }
  o = vec4(best, 0., 1.);
}`;
// one cascade: trace this probe's ray over its stretch, on to each of the four probes above, and merge
const CASCADE = steps => HEAD + `#define STEPS ${steps}

uniform sampler2D scene, seed, up; uniform ivec2 size; uniform int b; uniform float s, t0, t1; uniform int top; uniform ivec2 upn; uniform vec3 sky; uniform float seedf, jit;
vec4 trace(vec2 a, vec2 e) {
  vec2 v = e - a; float len = length(v); if (len < 1e-3) return vec4(0., 0., 0., 1.); v /= len;
  float t = 0.;
  for (int i = 0; i < STEPS; i++) {
    vec2 q = a + v * t;
    if (q.x < 0. || q.y < 0. || q.x >= float(size.x) || q.y >= float(size.y)) return vec4(0., 0., 0., 1.);
    vec2 n = texelFetch(seed, ivec2(q), 0).xy; float d = n.x > -1e3 ? length(n - q) : 1e4;
    if (d < .75) { vec4 h = texelFetch(scene, ivec2(q), 0); return vec4(h.rgb, 0.); }
    t += max(d - .71, .5);
    if (t >= len) return vec4(0., 0., 0., 1.);
  }
  return vec4(0., 0., 0., 1.);
}
vec4 upper(ivec2 pr, int d) {   // the four rays above this one, averaged, at upper probe pr
  int B = b * 2; vec4 sum = vec4(0.);
  for (int j = 0; j < 4; j++) { int k = d * 4 + j; sum += texelFetch(up, pr * B + ivec2(k % B, k / B), 0); }
  return sum * .25;
}
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy), pr = t / b, lo = t - pr * b; int d = lo.y * b + lo.x, n = b * b;
  // each probe's rays turn by a different part of their own slice each frame (and the frames are
  // averaged after), so a small bright thing isn't seen by one ray and missed by the next as blotches
  float h = fract(sin(dot(vec2(pr) + seedf * vec2(7.13, 3.71), vec2(12.9898, 78.233))) * 43758.5453);
  float ang = 6.2831853 * (float(d) + .5 + (h - .5) * jit) / float(n); vec2 dir = vec2(cos(ang), sin(ang));
  vec2 p = (vec2(pr) + .5) * s;
  if (top == 1) { vec4 r = trace(p + dir * t0, p + dir * t1); o = vec4(r.rgb + r.a * sky, r.a); return; }
  vec2 u = p / (s * 2.) - .5; vec2 f = fract(u); ivec2 base = ivec2(floor(u));
  vec4 acc = vec4(0.);
  for (int j = 0; j < 4; j++) {
    ivec2 off = ivec2(j & 1, j >> 1), q = clamp(base + off, ivec2(0), upn - 1);
    float w = (off.x == 1 ? f.x : 1. - f.x) * (off.y == 1 ? f.y : 1. - f.y);
    vec2 qp = (vec2(q) + .5) * s * 2.;
    vec4 r = trace(p + dir * t0, qp + dir * t1), m = upper(q, d);
    acc += w * vec4(r.rgb + r.a * m.rgb, r.a * m.a);
  }
  o = acc;
}`;
// the light at each texel from cascade 0, mixed with the last frames' (moved with the camera) for a steady picture
const IRR = HEAD + `
uniform sampler2D c0, hist; uniform ivec2 size, n0; uniform float keep; uniform vec2 shift;
void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 u = p / 2. - .5, f = fract(u); ivec2 base = ivec2(floor(u)); vec3 e = vec3(0.);
  for (int j = 0; j < 4; j++) {
    ivec2 off = ivec2(j & 1, j >> 1), q = clamp(base + off, ivec2(0), n0 - 1);
    float w = (off.x == 1 ? f.x : 1. - f.x) * (off.y == 1 ? f.y : 1. - f.y);
    e += w * (texelFetch(c0, q * 2, 0).rgb + texelFetch(c0, q * 2 + ivec2(1, 0), 0).rgb + texelFetch(c0, q * 2 + ivec2(0, 1), 0).rgb + texelFetch(c0, q * 2 + ivec2(1, 1), 0).rgb) * .25;
  }
  vec2 hp = p - shift; float k = keep;
  if (hp.x < 0. || hp.y < 0. || hp.x > float(size.x) || hp.y > float(size.y)) k = 0.;
  vec3 h = texture(hist, hp / vec2(size)).rgb;
  // where the light really changed (a light moved, a door opened) the old frames go at once; the
  // small differences of the turned rays are what gets averaged
  float ch = length(h - e) / (length(h) + length(e) + .05);
  o = vec4(mix(e, h, k * (1. - smoothstep(.25, .6, ch))), 1.);
}`;
// the two pictures that go onto the game's canvas: what multiplies it (top half) and the haze that adds to it (bottom half)
const FINAL = HEAD + `
uniform sampler2D irr; uniform vec2 out_; uniform vec3 amb; uniform float expo, haze; uniform int pixel;
void main() {
  vec2 fc = gl_FragCoord.xy; bool glow = fc.y < out_.y; float y = glow ? fc.y : fc.y - out_.y;
  vec3 e = texture(irr, vec2(fc.x, out_.y - y) / out_).rgb;   // (the default framebuffer is upside down)
  vec3 lit = 1. - exp(-e * expo);
  if (pixel == 1) lit = floor(lit * 3. + .35) / 3.;
  o = glow ? vec4(lit * lit * haze, 1.) : vec4(min(vec3(1.), amb + lit * (1. - amb)), 1.);
}`;

function compile(gl, src) {
  const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, VS); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, src); gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error('glow2d shader: ' + gl.getShaderInfoLog(fs));
  const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('glow2d link: ' + gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), name = a.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

/** The shared chip context, or null where glow can't run (no WebGL2 or no half-float pictures). */
function engine() {
  if (G || broken) return G;
  try {
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(2, 2);
    cv.width = cv.height = 2;
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl || !(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) { broken = true; return null; }
    cv.addEventListener?.('webglcontextlost', e => { e.preventDefault(); broken = true; G = null; });
    G = { cv, gl, scene: compile(gl, SCENE), seed: compile(gl, SEED), jfa: compile(gl, JFA), cascade: compile(gl, CASCADE(28)), irr: compile(gl, IRR), final: compile(gl, FINAL), vao: gl.createVertexArray() };
  } catch (e) { console.warn('[look2d] glow off:', e.message); broken = true; G = null; }
  return G;
}
/** Whether glowing light can run on this phone (asks the chip once). */
export const glowWorks = () => !!engine();

function tex(gl, w, h, half = true) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function target(gl, w, h, half, linear = false) { const t = tex(gl, w, h, half); if (linear) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); } const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, f, w, h }; }

/** How many cascades cover a field fw x fh (each reaches 4 times further than the last, from 2 texels). */
export function cascadesFor(fw, fh, a0 = A0()) { const diag = Math.hypot(fw, fh); let n = 1; while (a0 * (4 ** n - 1) / 3 < diag) n++; return n; }
const A0 = () => 1;   // cascade 0's rays reach 1 texel; each cascade up 4 times further

/**
 * The chip's half of a glowing Lights: sized fw x fh texels. run() takes the scene canvas (already
 * drawn), the lights in texels, and leaves the two pictures in the shared canvas for draw().
 */
export class GlowField {
  constructor(fw, fh) {
    this.fw = fw; this.fh = fh; this.n = cascadesFor(fw, fh);
    const top = 2 ** this.n;   // the widest probe spacing (and block) of any cascade
    this.cw = Math.ceil(fw / top) * top; this.ch = Math.ceil(fh / top) * top;
    this.res = null; this.frame = 0; this.fresh = true;
    this.Lf = new Float32Array(MAXL * 4); this.Cf = new Float32Array(MAXL * 4);
  }
  alloc(g) {
    const { gl } = g, { fw, fh, cw, ch } = this;
    const src = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.res = { g, src, scene: target(gl, fw, fh, true), jA: target(gl, fw, fh, true), jB: target(gl, fw, fh, true), cA: target(gl, cw, ch, true), cB: target(gl, cw, ch, true), hA: target(gl, fw, fh, true, true), hB: target(gl, fw, fh, true, true) };
    this.fresh = true;
  }
  free() {
    const r = this.res; if (!r) return; this.res = null;
    const { gl } = r.g; if (gl.isContextLost()) return;
    gl.deleteTexture(r.src); for (const k of ['scene', 'jA', 'jB', 'cA', 'cB', 'hA', 'hB']) { gl.deleteTexture(r[k].t); gl.deleteFramebuffer(r[k].f); }
  }
  /** False if the chip isn't there (the caller draws its canvas lights instead). */
  run(sceneCanvas, lights, { bright = 3, amb = [.15, .15, .15], expo = 1, haze = .3, pixel = false, sky = [0, 0, 0], ow, oh, shift = [0, 0], keep = .75 }) {
    const g = engine(); if (!g) return false;
    if (this.res && this.res.g !== g) this.res = null;   // (a lost context came back as a new one)
    if (!this.res) this.alloc(g);
    const { gl } = g, r = this.res, { fw, fh } = this;
    gl.bindVertexArray(g.vao); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    const pass = (prog, tgt, w, h) => { gl.useProgram(prog.p); gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.f : null); gl.viewport(0, 0, w, h); };
    const bind = (prog, name, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u[name], unit); };
    const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
    // the game's canvas up (rows as they are: row 0 the top, as every pass reads it)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, r.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);
    // the scene
    const nl = Math.min(MAXL, lights.length), Lf = this.Lf, Cf = this.Cf;
    for (let i = 0; i < nl; i++) { const l = lights[i]; Lf.set([l.x, l.y, l.a, l.cone || 0], i * 4); Cf.set([l.r, l.g, l.b, l.dir || 0], i * 4); }
    let P = g.scene; pass(P, r.scene, fw, fh); bind(P, 'src', r.src, 0);
    gl.uniform1f(P.u.bright, bright); gl.uniform1i(P.u.nl, nl);
    if (nl) { gl.uniform4fv(P.u.L, Lf.subarray(0, nl * 4)); gl.uniform4fv(P.u.C, Cf.subarray(0, nl * 4)); }
    draw();
    // the walls' distance field
    P = g.seed; pass(P, r.jA, fw, fh); bind(P, 'scene', r.scene.t, 0); draw();
    let a = r.jA, b = r.jB;
    P = g.jfa; gl.useProgram(P.p); gl.uniform2i(P.u.size, fw, fh);
    for (let k = 2 ** Math.ceil(Math.log2(Math.max(fw, fh)) - 1); ; k >>= 1) {
      const step = Math.max(1, k);
      pass(P, b, fw, fh); bind(P, 'seed', a.t, 0); gl.uniform1i(P.u.k, step); draw(); [a, b] = [b, a];
      if (k <= 1) break;
    }
    const field = a;
    // the cascades, from the top down
    P = g.cascade; let up = r.cA, cur = r.cB;
    for (let i = this.n - 1; i >= 0; i--) {
      const s = 2 ** (i + 1), bb = 2 ** (i + 1), w = Math.ceil(fw / s) * bb, h = Math.ceil(fh / s) * bb;
      pass(P, cur, w, h); bind(P, 'scene', r.scene.t, 0); bind(P, 'seed', field.t, 1); bind(P, 'up', up.t, 2);
      gl.uniform2i(P.u.size, fw, fh); gl.uniform1i(P.u.b, bb); gl.uniform1f(P.u.s, s);
      const a0 = A0(); gl.uniform1f(P.u.t0, a0 * (4 ** i - 1) / 3); gl.uniform1f(P.u.t1, a0 * (4 ** (i + 1) - 1) / 3);
      gl.uniform1i(P.u.top, i === this.n - 1 ? 1 : 0); gl.uniform2i(P.u.upn, Math.ceil(fw / (s * 2)), Math.ceil(fh / (s * 2)));
      gl.uniform3fv(P.u.sky, sky); gl.uniform1f(P.u.seedf, this.frame % 64); gl.uniform1f(P.u.jit, keep > 0 ? 1 : 0);
      draw(); [up, cur] = [cur, up];
    }
    // the light, kept over frames
    this.frame = (this.frame + 1) | 0;
    const [hNew, hOld] = this.frame & 1 ? [r.hA, r.hB] : [r.hB, r.hA];
    P = g.irr; pass(P, hNew, fw, fh); bind(P, 'c0', up.t, 0); bind(P, 'hist', hOld.t, 1);
    gl.uniform2i(P.u.size, fw, fh); gl.uniform2i(P.u.n0, Math.ceil(fw / 2), Math.ceil(fh / 2));
    gl.uniform1f(P.u.keep, this.fresh ? 0 : keep); gl.uniform2f(P.u.shift, shift[0], shift[1]);
    draw(); this.fresh = false;
    // the two pictures, one over the other, in the shared canvas
    if (g.cv.width !== ow || g.cv.height !== oh * 2) { g.cv.width = ow; g.cv.height = oh * 2; }
    P = g.final; pass(P, null, ow, oh * 2); bind(P, 'irr', hNew.t, 0);
    gl.uniform2f(P.u.out_, ow, oh);
    gl.uniform3fv(P.u.amb, amb); gl.uniform1f(P.u.expo, expo); gl.uniform1f(P.u.haze, haze); gl.uniform1i(P.u.pixel, pixel ? 1 : 0);
    draw();
    return g.cv;
  }
}

/** How finely to work out glowing light for a w x h game: texels per game unit. */
export function glowRes(w, h, res) {
  if (res) return res;
  const k = phoneClass(), long = k === 'top' ? 520 : k === 'mid' ? 420 : 320;
  return Math.min(2, Math.max(.4, long / Math.max(w, h)));
}
