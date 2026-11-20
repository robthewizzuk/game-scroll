// Ground with no repeats: a runtime virtual texture painted round the camera (a "clipmap": two square pictures,
// a fine one close by and a coarser one further out, each following the camera in steps).
//
// The ground's own materials (asphalt, paving, a plaza's flags, grass) are drawn once, from above, into those
// pictures by paint materials that work their look out from where each texel is in the world: a tint that
// wanders over tens of metres, repairs patched into the asphalt, its stones, cracks and oil stains; slabs laid in
// a bond with their joints, a cracked or replaced one, chewing gum and stains; and the stamps a game or the city
// lays (oil under parked cars, skid marks, scorches). Nothing repeats, and nothing is painted twice: when the
// camera has moved a step only the strip it uncovered is painted (the pictures wrap round), a few strips a frame.
//
// The ground's materials then read the pictures in place of their own tiled map (the 'groundpaint' look): one
// picture read a pixel where they used to read one, the finer level near, the coarser next, their own map past
// both, each change a smooth blend over a band so no line shows. Colour is kept as its square root (no banding in the
// dark asphalt in 8 bits) and the alpha holds the roughness. Mipmapped, so the far edge does not shimmer.
//
// Painted by whichever renderer draws the view (a picture lives on the GPU API that drew it): plain shader
// materials on WebGL, node materials on WebGPU (ground-paint-gpu.js, the same sums: change both). Positions are
// the world's own (with origin.js's centre added), so a far-out world that shifts its centre paints the same.
// Only faces that look up read the pictures (a kerb's side keeps its own map). One ground paint at a time: the
// materials that read it share one set of settings, so a second GroundPaint takes them over.
//
//   const gp = new GroundPaint(view, { levels: [[32, 1024], [128, 1024]] });
//   gp.add(roadMesh, 'asphalt');  gp.add(pavementMesh, 'paving');    // paints them, and they read it
//   gp.stamp(x, z, 'oil', { size: .8 });  gp.stamp(x, z, 'skid', { size: 6, angle, track: 1.5 });
//   gp.update(camera.position);   // each frame (before the view draws)
//
// Kit use only: gs.city lays its ground with it (City option paint).
import { Color, Mesh, OrthographicCamera, Scene, ShaderMaterial, Vector4, WebGLRenderTarget, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, NoColorSpace } from 'three';
import { lookPatch } from './looks.js';
import { ORIGIN, ORIGIN_U, ORIGIN_GLSL } from './origin.js';
import { bakeRenderer } from './hd3d.js';
import { webgpu } from './gpu.js';
import { looksOf } from './looks.js';

/** The kinds of ground it paints (a paint material's kind number). */
export const PAINT_KINDS = { asphalt: 0, paving: 1, plaza: 2, grass: 3, yard: 4 };
/** The marks it lays (a stamp's kind number): stains and tyre marks, and painted lines, polished lanes and hatched boxes. */
export const STAMP_KINDS = { oil: 0, skid: 1, scorch: 2, line: 3, lane: 4, hatch: 5 };
export const STAMPS_MAX = 24;   // stamps one piece's paint can take (a piece with more is painted in smaller pieces: paint())

/* ---------- the paint, GLSL (ground-paint-gpu.js has it as nodes) ---------- */
// A stamp is three vec4s: A (x, z, half its length or its size, its angle), B (kind, strength, width or track, seed),
// C (the paint's colour, linear, and a dash's length: 0 solid; a hatch's stripe spacing). Lanes come first in each
// piece's list (paint()): a painted line in a lane where wheels run is worn further.
export const PAINT_GLSL = `
float gpH(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float gpN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(gpH(i), gpH(i + vec2(1., 0.)), f.x), mix(gpH(i + vec2(0., 1.)), gpH(i + vec2(1., 1.)), f.x), f.y); }
float gpF(vec2 p) { return gpN(p) * .5 + gpN(p * 2.03 + 7.1) * .3 + gpN(p * 4.11 + 3.7) * .2; }
// how near the edge between two cells of a jittered grid (a crack's line), in cells
float gpEdge(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), r = g + vec2(gpH(i + g), gpH(i + g + 19.7)) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
// a soft stain in a cell of a grid (cell metres, how many cells have one): how much of it is at p
float gpStain(vec2 p, float cell, float often, float seed) {
  vec2 c = floor(p / cell); if (gpH(c + seed) > often) return 0.;
  vec2 at = (c + .2 + .6 * vec2(gpH(c + seed + 5.), gpH(c + seed + 6.))) * cell; float r = cell * (.1 + .2 * gpH(c + seed + 7.));
  return 1. - smoothstep(r * .4, r, length(p - at) * (1. + .45 * gpN(p * 2.7 + seed)));
}
// paint on the ground, chipped: what is left of it at p, from noise in the world down to millimetres (never a picture's
// texels), worn further where wear says (0..1: traffic over it), never over a gap (a joint or crack takes it)
float gpChip(vec2 p, float wear, float gap) {
  float n = gpN(p * 17.) * .45 + gpN(p * 57. + 11.) * .33 + gpN(p * 181. + 5.) * .22, t = mix(.26, .62, clamp(wear + gpN(p * .45 + 7.) * .35 - .1, 0., 1.));
  return smoothstep(t - .045, t + .045, n * .7 + gpN(p * 3.3 + 2.) * .3) * (1. - gap);
}
uniform vec4 gpStampA[${STAMPS_MAX}]; uniform vec4 gpStampB[${STAMPS_MAX}]; uniform vec4 gpStampC[${STAMPS_MAX}]; uniform float gpStampN;
// the ground at p (metres, the world's own): its colour (linear) and roughness, from its base colour and kind
vec4 gpPaint(vec2 p, vec3 base, float kind) {
  vec3 c = base * (.84 + .32 * gpF(p * .07)); float r = .86, gap = 0., wear = 0.;
  if (kind < .5) {   // asphalt: repairs, stones, cracks, oil
    vec2 cell = floor(p / 7.); float h = gpH(cell + 11.);
    if (h < .3) {   // a patch: newer and darker, or older and paler, with a sealed seam round it
      vec2 lo = cell * 7. + vec2(gpH(cell + 1.), gpH(cell + 2.)) * 3., hi = lo + 1.5 + vec2(gpH(cell + 3.), gpH(cell + 4.)) * 3.5;
      vec2 q = smoothstep(lo - .01, lo + .01, p) * (1. - smoothstep(hi - .01, hi + .01, p)); vec2 e = min(p - lo, hi - p);
      float inP = q.x * q.y, seam = (1. - smoothstep(.02, .05, min(e.x, e.y))) * inP;
      c *= mix(1., h < .15 ? .72 : 1.22, inP); c *= 1. - .35 * seam; }
    float fine = gpN(p * 45.), stone = step(.93, gpH(floor(p * 70.)));
    c *= .9 + .2 * fine; c = mix(c, c * 1.7 + .02, stone * .7);
    // cracks: a wandering net in some places; long sealed tar lines in others
    vec2 w = p + (vec2(gpN(p * 1.3), gpN(p * 1.3 + 9.)) - .5) * .5;
    float crack = (1. - smoothstep(.004, .016, gpEdge(w / 2.3))) * smoothstep(.62, .7, gpN(p * .35 + 5.));
    float tar = (1. - smoothstep(.003, .009, abs(gpN(p * .17 + 3.1) - .5))) * step(.55, gpN(p * .05 + 1.7));
    c *= 1. - .55 * crack; c = mix(c, base * .45, tar * .8); r = mix(r + (fine - .5) * .08, .95, crack); r = mix(r, .55, tar);
    float oil = gpStain(p, 3., .16, 31.); c *= 1. - .45 * oil; r = mix(r, .5, oil * .8);
    gap = max(crack, tar * .6);
  } else if (kind < 2.5) {   // paving slabs (.6 m) or a plaza's flags (1.2 m), laid in a bond: joints, a few cracked or new, gum, stains
    float S = kind < 1.5 ? .6 : 1.2; vec2 q = p / S; q.x += step(1., mod(floor(q.y), 2.)) * .5; vec2 id = floor(q), f = fract(q);
    float hs = gpH(id + 7.); c *= .9 + .2 * hs; if (hs > .97) c *= .8;
    float j = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * S, joint = 1. - smoothstep(.004, .01, j);
    if (gpH(id + 13.) < .07) { float a = gpH(id + 1.), b = gpH(id + 2.); float d = abs((f.x - mix(a, b, f.y)) + .04 * (gpN(q * 9.) - .5)) * S; joint = max(joint, (1. - smoothstep(.002, .006, d)) * .8); }
    float fine = gpN(p * 60.); c *= (.94 + .12 * fine) * (1. - .45 * joint); r = mix(r + .04, 1., joint);
    vec2 gc = floor(p * 1.1); if (gpH(gc + 3.) < .25) { vec2 gp = (gc + vec2(gpH(gc + 4.), gpH(gc + 5.))) / 1.1; c = mix(c, base * .25, (1. - smoothstep(.008, .014, length(p - gp))) * .8); }
    float st = gpStain(p, 2.6, .1, 47.); c *= 1. - .3 * st; r = mix(r, .7, st * .5);
    gap = joint;
  } else if (kind < 3.5) {   // grass: patches of it greener and browner
    c *= .85 + .3 * gpN(p * 1.3); r = 1.;
  } else {   // a yard's cast concrete: 6 x 4.5 m slabs with tar in their joints, pale stones in it, cracked in places (some cracks sealed with tar), oil and rust
    vec2 SZ = vec2(6., 4.5), q = p / SZ, id = floor(q), f = fract(q); float hs = gpH(id + 7.), hs2 = gpH(id + 8.);
    c *= .84 + .3 * hs;
    vec2 e = min(f, 1. - f) * SZ; float jd = min(e.x, e.y) + (gpN(p * 3.1) - .5) * .018, tw = .014 + .018 * gpN(p * .9 + 4.);
    float tar = 1. - smoothstep(tw * .55, tw, jd), edge = (1. - smoothstep(tw, tw + .03, jd)) * (1. - tar);   // (the slab's edge beside the joint: worn round, a little darker)
    float fine = gpN(p * 55.), agg = smoothstep(.66, .82, gpN(p * 34. + 3.)) * .6 + step(.955, gpH(floor(p * 85.))) * .6;
    c *= .9 + .2 * fine; c = mix(c, c * 1.45 + .025, agg * .55); c *= 1. - .18 * edge;
    float area = smoothstep(.78, .9, gpN(p * .28 + 2.) * .7 + hs * .45);   // (cracks gather in some slabs)
    vec2 w = p + (vec2(gpN(p * 1.7), gpN(p * 1.7 + 9.)) - .5) * .4; float ed = gpEdge(w / 1.7);
    float aa = fwidth(p.x) / 1.7, cw = max(.011, aa * 1.5), sw = max(.022, aa * 2.);   // (never thinner than a texel of the picture: no dotted cracks)
    float sealed = step(.6, hs2), crack = (1. - smoothstep(cw * .3, cw, ed)) * area * (1. - sealed) * clamp(.0165 / cw, .35, 1.), seal = (1. - smoothstep(sw * .45, sw, ed)) * area * sealed;
    c *= 1. - .5 * crack; c = mix(c, base * .1, max(tar * .94, seal * .8));
    r = .8 + (fine - .5) * .1 + (gpN(p * 9.) - .5) * .08; r = mix(r, .55, max(tar, seal)); r = mix(r, .95, crack);
    // wear where traffic runs (lanes add more): darker, smoother
    wear = smoothstep(.58, .82, gpF(p * .06 + 13.)) * .5; c *= 1. - .16 * wear; r -= .12 * wear;
    float oil = gpStain(p, 4., .14, 31.); c *= 1. - .5 * oil; r = mix(r, .48, oil * .85);
    float rust = gpStain(p, 5.5, .07, 63.); c = mix(c, c * vec3(1.35, .9, .6), rust * .7);
    gap = max(max(tar, seal), crack);
  }
  // the stamps on this piece: oil, skid marks, scorches; polished lanes; painted lines and hatched boxes
  for (int i = 0; i < ${STAMPS_MAX}; i++) {
    if (float(i) >= gpStampN) break;
    vec4 A = gpStampA[i], B = gpStampB[i], C = gpStampC[i]; vec2 d = p - A.xy; float cs = cos(A.w), sn = sin(A.w);
    vec2 lm = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y), l = lm / A.z; float s = 0., n = gpN(p * 3. + B.w);
    if (B.x < .5) { s = 1. - smoothstep(.5, 1., length(l) * (1. + .3 * n)); c *= 1. - .5 * s * B.y; r = mix(r, .45, s); }
    else if (B.x < 1.5) { float dy = abs(abs(l.y * A.z) - B.z * .5); s = (1. - smoothstep(.06, .1, dy)) * smoothstep(-1., -.8, l.x) * (1. - smoothstep(.6, 1., l.x)) * (.6 + .4 * gpN(p * 20.)); c *= 1. - .6 * s * B.y; }
    else if (B.x < 2.5) { s = 1. - smoothstep(.2, 1., length(l) * (1. + .4 * n)); c = mix(c, c * .15, s * B.y); r = mix(r, .95, s); }
    else if (B.x < 3.5 || B.x > 4.5) {   // a painted line (B.z wide, dashed C.w) or a hatched box (B.z half its width, stripes C.w apart): chipped, worn where wheels run
      float wob = (gpN(p * 23. + B.w) - .5) * .012, inside;
      if (B.x < 3.5) {
        inside = (1. - smoothstep(B.z * .5 - .006, B.z * .5 + .006, abs(lm.y) + wob)) * (1. - smoothstep(A.z - .01, A.z + .01, abs(lm.x)));
        if (C.w > 0.) inside *= smoothstep(.48, .5, fract(lm.x / (2. * C.w) + .25)) * (1. - smoothstep(.98, 1., fract(lm.x / (2. * C.w) + .25)));
      } else {
        vec2 bd = vec2(A.z, B.z) - abs(lm); float rim = min(bd.x, bd.y);
        float stripe = smoothstep(.47, .5, fract((lm.x + lm.y) / max(C.w, .1))) * (1. - smoothstep(.97, 1., fract((lm.x + lm.y) / max(C.w, .1))));
        inside = smoothstep(-.006, .006, rim + wob) * max(1. - smoothstep(.1, .112, rim + wob), stripe);
      }
      s = inside * gpChip(p + B.w, wear + (1. - B.y), gap);
      c = mix(c, C.rgb * (.72 + .28 * gpN(p * .7 + B.w)), s * .94); r = mix(r, .62, s);
    } else {   // a lane worn by traffic (B.z wide): polished smoother and darker, rubber in the two wheel tracks
      float across = abs(lm.y) / max(B.z * .5, .01), along = 1. - smoothstep(A.z - 1.5, A.z, abs(lm.x));
      s = (1. - smoothstep(.55, 1.05, across + (n - .5) * .3)) * along * B.y;
      float tracks = (1. - smoothstep(.08, .22, abs(across - .5) + (gpN(p * 1.9 + B.w) - .5) * .12)) * along * B.y;
      wear = max(wear, s); c *= 1. - .14 * s - .22 * tracks; r -= .16 * s + .06 * tracks;
    }
  }
  return vec4(max(c, 0.), clamp(r, .05, 1.));
}`;

const PAINT_VERT = ORIGIN_GLSL + `varying vec2 vGpW;
void main() { vec4 w = modelMatrix * vec4(position, 1.); vGpW = w.xz + gsOrigin.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const PAINT_FRAG = `varying vec2 vGpW; uniform vec4 gpBase;
${PAINT_GLSL}
void main() { vec4 g = gpPaint(vGpW, gpBase.rgb, gpBase.w); gl_FragColor = vec4(sqrt(g.rgb), g.a); }`;

// the stamps' uniforms, shared by every paint material (set for each strip)
const v4s = () => Array.from({ length: STAMPS_MAX }, () => new Vector4());
const STAMP_U = { gpStampA: { value: v4s() }, gpStampB: { value: v4s() }, gpStampC: { value: v4s() }, gpStampN: { value: 0 } };
/** Loads a piece's stamps into the paint's uniforms (both renderers read these arrays). */
export function loadStamps(list) {
  list.forEach((s, i) => { STAMP_U.gpStampA.value[i].copy(s.A); STAMP_U.gpStampB.value[i].copy(s.B); STAMP_U.gpStampC.value[i].copy(s.C); });
  STAMP_U.gpStampN.value = list.length;
}
// paint colours by name (linear), as worn road and yard paint is: never quite white or a clean yellow
const PAINTS = { white: '#d9d8d0', yellow: '#d6a21e', red: '#a8322a', blue: '#2f5a9a', black: '#1c1c1c', green: '#3c7a46', orange: '#d2671f' };
const paintColour = c => { const k = new Color(PAINTS[c] ?? c ?? PAINTS.white); return [k.r, k.g, k.b]; };
function paintMatGL(base, kind) {
  return new ShaderMaterial({ uniforms: { ...STAMP_U, gpBase: { value: new Vector4(base.r, base.g, base.b, kind) }, gsOrigin: ORIGIN_U }, vertexShader: PAINT_VERT, fragmentShader: PAINT_FRAG, depthTest: false, depthWrite: false });
}

/* ---------- reading it: the ground's own material ---------- */
// (L: the two levels' centres and sizes, world metres: x0, z0 of the fine one, its size, the coarse one's size; L2: the coarse one's centre;
// the levels hold sqrt(colour) and roughness; past both the material's own map)
const READ_HEAD = ORIGIN_GLSL + `varying vec3 vGpRW;
uniform sampler2D gpT0, gpT1; uniform vec4 gpL, gpL2; uniform float gpOn;
`, READ_FRAG_HEAD = READ_HEAD + 'float gsGroove;\n';
// gsGroove: what the puddles in the rain read (hd3d.js AIR_WET): how much darker than the ground round it the fine level is
// here (a joint, a crack, tar: where a film of water stays), or lighter (painted lines: a little raised, dry first), from one more
// read of the same picture a few mip levels down (no picture of its own: a ground material already reads many)
const READ = `
  float gpRough = -1., gpK = 0.; gsGroove = 0.;
  {
    vec2 gp = vGpRW.xy, gq = vec2(gp.x, -gp.y), gx = dFdx(gq), gy = dFdy(gq);   // (the pictures' v runs along -z: painter's note)
    float m0 = max(abs(gp.x - gpL.x), abs(gp.y - gpL.y)) / (gpL.z * .5), m1 = max(abs(gp.x - gpL2.x), abs(gp.y - gpL2.y)) / (gpL.w * .5);
    float w0 = smoothstep(.8, .95, m0); gpK = gpOn > .5 && vGpRW.z > .7 ? 1. - smoothstep(.82, .97, m1) : 0.;   // (a face that looks up)
    vec4 g = vec4(0., 0., 0., 1.), own = diffuseColor;
    if (gpK > 0.) {   // (each change a smooth blend over its band: see ground-paint-gpu.js)
      if (w0 < 1.) { vec4 a = textureGrad(gpT0, gq / gpL.z, gx / gpL.z, gy / gpL.z); g = vec4(a.rgb * a.rgb, a.a);
        vec3 ab = textureGrad(gpT0, gq / gpL.z, gx / gpL.z * 6., gy / gpL.z * 6.).rgb; float gsGl = dot(a.rgb, vec3(.3, .5, .2)) / max(dot(ab, vec3(.3, .5, .2)), .02);
        gsGroove = (smoothstep(.88, .55, gsGl) - smoothstep(1.15, 1.5, gsGl)) * (1. - w0) * gpK; }
      if (w0 > 0.) { vec4 b = textureGrad(gpT1, gq / gpL.w, gx / gpL.w, gy / gpL.w); g = mix(g, vec4(b.rgb * b.rgb, b.a), w0); }
    }
#ifdef USE_MAP
    if (gpK < 1.) own *= texture2D(map, vMapUv);
#endif
    diffuseColor = mix(own, vec4(diffuseColor.rgb * g.rgb, diffuseColor.a), gpK); gpRough = g.a;
  }`;
// what the ground's materials read (one set for all of them: the ground paint at work)
const READ_U = { gpT0: { value: null }, gpT1: { value: null }, gpL: { value: new Vector4() }, gpL2: { value: new Vector4() }, gpOn: { value: 0 }, gsOrigin: ORIGIN_U };
function readLook(m) {
  m.defines = { ...m.defines, GS_GROUND_PAINT: '' };   // (AIR_WET reads gsGroove)
  lookPatch(m, 'groundpaint', {
    uniforms: READ_U,
    vertexHead: READ_HEAD,
    vertex: [['#include <project_vertex>', 'after', '\n  { vec4 gpw = modelMatrix * vec4(transformed, 1.); vGpRW = vec3(gpw.xz + gsOrigin.xz, normalize(mat3(modelMatrix) * objectNormal).y); }']],
    fragmentHead: READ_FRAG_HEAD,
    fragment: [['#include <map_fragment>', 'replace', READ], ['#include <roughnessmap_fragment>', 'after', '\n  roughnessFactor = mix(roughnessFactor, gpRough, gpK);']],
  });
}

/* ---------- the painter ---------- */
const STEPS = 8;   // a level moves in steps of an eighth of its size
export class GroundPaint {
  /**
   * view: an HDView. levels: [[size in metres, texels], ...] fine first (two). perFrame: strips painted a frame at most.
   */
  constructor(view, { levels = [[32, 1024], [128, 1024]], perFrame = 2 } = {}) {
    this.view = view; this.perFrame = perFrame;
    if (view && typeof view.render === 'function') view._groundPaint = this;
    this.levels = levels.slice(0, 2).map(([size, px]) => ({ size, px, cx: NaN, cz: NaN, rt: null, gpu: null, todo: [] }));
    while (this.levels.length < 2) this.levels.push({ ...this.levels[0], todo: [] });
    // (looking straight down, +x to the right and -z up the picture: the pictures' rows run along -z, so v = -z / size)
    this.scene = new Scene(); this.cam = new OrthographicCamera(-1, 1, 1, -1, .1, 400); this.cam.up.set(0, 0, -1);
    this.surfaces = []; this.stamps = []; this.mats = new Map(); this.backend = '';
    this.U = READ_U; READ_U.gpOn.value = 0;
    this.read = new Set();
    this.info = { painted: 0, strips: 0, texels: 0 };
  }
  /** Paints this mesh's ground into the pictures (kind: 'asphalt' | 'paving' | 'plaza' | 'grass'; base: its colour, else its material's) and has its material read them. */
  add(mesh, kind = 'asphalt', { base = null, order = null } = {}) {
    const k = PAINT_KINDS[kind] ?? 0, col = new Color(base ?? mesh.material?.color ?? '#808080');
    const key = k + ':' + col.getHexString();
    let pm = this.mats.get(key); if (!pm) this.mats.set(key, pm = { gl: paintMatGL(col, k), gpu: null, col, k });
    mesh.updateMatrixWorld(true);
    const p = new Mesh(mesh.geometry, pm.gl); p.matrixAutoUpdate = false; p.matrix.copy(mesh.matrixWorld); p.matrixWorld.copy(mesh.matrixWorld); p.frustumCulled = false; p.userData.paint = pm;
    p.renderOrder = order ?? this.surfaces.length;   // (no depth: what is added later is painted over what was added before, so lay the lowest first)
    this.scene.add(p); this.surfaces.push({ mesh, p });
    const m = mesh.material; if (m && !this.read.has(m)) { this.read.add(m); if (!looksOf(m).includes('groundpaint')) readLook(m); }
    // what it covers is painted again
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    this.dirty(b.min.x + ORIGIN.x, b.min.z + ORIGIN.z, b.max.x + ORIGIN.x, b.max.z + ORIGIN.z);
    return p;
  }
  /** Takes a mesh out (its material goes on reading what is painted until the strip is painted again). */
  remove(mesh) { const i = this.surfaces.findIndex(s => s.mesh === mesh); if (i >= 0) { this.surfaces[i].p.removeFromParent(); this.surfaces.splice(i, 1); } }
  /**
   * A mark on the ground (x, z: the world's own metres): 'oil' (size: across), 'skid' (size: long; track: between the wheels),
   * 'scorch', 'line' (size: long, width, colour, dash: a dash's length, 0 solid), 'lane' (size: long, width: where wheels
   * run, polished and with rubber in two tracks), 'hatch' (size: long, width, colour, dash: the stripes' spacing).
   * angle turns it about y (0: its length along +x). strength 0..1 (a line or hatch: how fresh its paint is).
   */
  stamp(x, z, kind = 'oil', { size = 1, angle = 0, strength = 1, track = 1.5, width = .12, colour = 'white', dash = 0, seed = Math.random() * 100 } = {}) {
    const k = STAMP_KINDS[kind] ?? 0, long = k >= 3, half = size * .5;
    const across = kind === 'line' ? width / 2 : kind === 'lane' || kind === 'hatch' ? width / 2 : kind === 'skid' ? track : half;
    const ca = Math.abs(Math.cos(angle)), sa = Math.abs(Math.sin(angle)), ex = (long || kind === 'skid' ? half : half * 1.2) * ca + across * sa + .05, ez = (long || kind === 'skid' ? half : half * 1.2) * sa + across * ca + .05;
    const [cr, cg, cb] = paintColour(colour);
    const s = { x, z, k, x0: x - ex, z0: z - ez, x1: x + ex, z1: z + ez, A: new Vector4(x, z, half, angle), B: new Vector4(k, strength, kind === 'skid' ? track : width * (kind === 'hatch' ? .5 : 1), seed), C: new Vector4(cr, cg, cb, dash) };
    this.stamps.push(s); this.dirty(s.x0, s.z0, s.x1, s.z1);
    return s;
  }
  /** A painted line from (x0, z0) to (x1, z1): width, colour ('white', 'yellow', 'red'... or any colour), dash (0 solid), strength (how fresh). */
  line(x0, z0, x1, z1, o = {}) { return this.stamp((x0 + x1) / 2, (z0 + z1) / 2, 'line', { ...o, size: Math.hypot(x1 - x0, z1 - z0), angle: Math.atan2(z1 - z0, x1 - x0) }); }
  /** A lane worn by traffic from (x0, z0) to (x1, z1), width wide. */
  lane(x0, z0, x1, z1, o = {}) { return this.stamp((x0 + x1) / 2, (z0 + z1) / 2, 'lane', { width: 3, ...o, size: Math.hypot(x1 - x0, z1 - z0), angle: Math.atan2(z1 - z0, x1 - x0) }); }
  /** Takes a stamp away again (as stamp() gave it). */
  unstamp(s) { const i = this.stamps.indexOf(s); if (i >= 0) { this.stamps.splice(i, 1); this.dirty(s.x0, s.z0, s.x1, s.z1); } }
  /** Paints the area again (world metres) on both levels, where it is in them. */
  dirty(x0, z0, x1, z1) { for (const L of this.levels) if (L.cx === L.cx) L.todo.push([x0, z0, x1, z1]); }
  /** Each frame, before the view draws: the camera's place (the view's own coordinates). */
  update(at) {
    const G = this.view._onGpu ? webgpu() : null, backend = G ? 'gpu' : 'gl', r = G ? G.r : this.gl || bakeRenderer();   // (gl: a stand-in renderer, for tests)
    if (!r) return this;
    if (backend !== this.backend) { this.backend = backend; for (const L of this.levels) { L.cx = NaN; L.todo.length = 0; } }   // (the other renderer's pictures: painted again)
    const X = at.x + ORIGIN.x, Z = at.z + ORIGIN.z;
    // a level that moves paints what it uncovered at once (its pictures are read about the new centre this frame)
    for (const L of this.levels) {
      const step = L.size / STEPS, cx = Math.round(X / step) * step, cz = Math.round(Z / step) * step, h = L.size / 2;
      if (!this.target(L, G)) return this;
      if (cx === L.cx && cz === L.cz) continue;
      const first = !(L.cx === L.cx) || Math.abs(cx - L.cx) > L.size * .6 || Math.abs(cz - L.cz) > L.size * .6;   // first, or jumped: all of it
      const strips = first ? [[cx - h, cz - h, cx + h, cz + h]] : [
        ...(cx !== L.cx ? [cx > L.cx ? [L.cx + h, cz - h, cx + h, cz + h] : [cx - h, cz - h, L.cx - h, cz + h]] : []),
        ...(cz !== L.cz ? [cz > L.cz ? [cx - h, L.cz + h, cx + h, cz + h] : [cx - h, cz - h, cx + h, L.cz - h]] : [])];
      if (first) L.todo.length = 0;
      L.cx = cx; L.cz = cz;
      for (const q of strips) this.clipPaint(L, q, r, G);
    }
    // then what was changed (a mesh added, a stamp), a few a frame, the fine level first
    let budget = this.perFrame;
    for (const L of this.levels) while (L.todo.length && budget > 0) if (this.clipPaint(L, L.todo.shift(), r, G)) budget--;
    const [L0, L1] = this.levels;
    this.U.gpL.value.set(L0.cx, L0.cz, L0.size, L1.size); this.U.gpL2.value.set(L1.cx, L1.cz, 0, 0);
    this.U.gpT0.value = L0.rt.texture; this.U.gpT1.value = L1.rt.texture; this.U.gpOn.value = 1;
    return this;
  }
  // paints the part of a rectangle inside the level (false if none of it is)
  clipPaint(L, [x0, z0, x1, z1], r, G) {
    const h = L.size / 2, a = Math.max(x0, L.cx - h), b = Math.max(z0, L.cz - h), c = Math.min(x1, L.cx + h), d = Math.min(z1, L.cz + h);
    if (!(c > a && d > b)) return false;
    this.paint(L, a, b, c, d, r, G); return true;
  }
  // a level's picture on this renderer
  target(L, G) {
    const want = G ? 'gpu' : 'gl';
    if (L.rt && L.rtFor === want) return L.rt;
    L.rt?.dispose();
    const o = { depthBuffer: false, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, wrapS: RepeatWrapping, wrapT: RepeatWrapping, colorSpace: NoColorSpace };
    L.rt = G ? new G.W.RenderTarget(L.px, L.px, o) : new WebGLRenderTarget(L.px, L.px, o);
    L.rt.texture.wrapS = L.rt.texture.wrapT = RepeatWrapping; L.rt.texture.name = 'ground paint';
    L.rtFor = want; L.cx = NaN;
    return L.rt;
  }
  // paints a rectangle of the world (inside the level) into its texels: split where the picture wraps round, and
  // where more stamps lie on a piece than one paint takes (a level's first paint covers all of it: a yard's lines,
  // or a city's oil under every parked car, used to be cut to the first 16 found)
  paint(L, x0, z0, x1, z1, r, G) {
    const S = L.size, N = L.px, tx = v => v / S * N;
    // texel columns (x) and rows (-z), wrapped: [c0, r0, width, height, and the world under them: x0, x1, z0, z1, the stamps on it]
    const pieces = [], cols = split(Math.round(tx(x0)), Math.round(tx(x1)), N), rows = split(Math.round(tx(-z1)), Math.round(tx(-z0)), N);
    for (const [c0, c1, cw] of cols) for (const [r0, r1, rw] of rows) this.piece(pieces, [c0, r0, c1 - c0, r1 - r0, (c0 + cw * N) / N * S, (c1 + cw * N) / N * S, -(r1 + rw * N) / N * S, -(r0 + rw * N) / N * S], this.stamps, S / N);
    if (!pieces.length) return;
    // (nothing cleared: the ground under the whole of it is painted over what was there, lowest first; mipmaps made after the last piece)
    if (G) G.fx.groundPaintRender(r, this, L, pieces, STAMP_U, loadStamps);
    else {
      const rt = L.rt, was = { rt: r.getRenderTarget(), auto: r.autoClear };
      for (const s of this.surfaces) s.p.material = s.p.userData.paint.gl;
      try {
        r.autoClear = false;
        pieces.forEach((q, i) => { loadStamps(q[8]); this.aim(q); rt.viewport.set(q[0], q[1], q[2], q[3]); rt.scissor.copy(rt.viewport); rt.scissorTest = true; rt.texture.generateMipmaps = i === pieces.length - 1; r.setRenderTarget(rt); r.render(this.scene, this.cam); });
      } finally { rt.viewport.set(0, 0, N, N); rt.scissor.set(0, 0, N, N); rt.scissorTest = false; rt.texture.generateMipmaps = true; r.setRenderTarget(was.rt); r.autoClear = was.auto; }
    }
    for (const q of pieces) { this.info.strips++; this.info.texels += q[2] * q[3]; }
    this.info.painted++;
  }
  // a piece with the stamps that touch it (lanes first: the lines in them are worn by them), halved until each half takes them all
  piece(out, q, from, texel) {
    const [c0, r0, w, h, wx0, wx1, wz0, wz1] = q;
    const on = from.filter(s => s.x1 > wx0 && s.x0 < wx1 && s.z1 > wz0 && s.z0 < wz1);
    if (on.length > STAMPS_MAX && Math.max(w, h) > 8) {
      if (w >= h) { const m = w >> 1, x = wx0 + m * texel; this.piece(out, [c0, r0, m, h, wx0, x, wz0, wz1], on, texel); this.piece(out, [c0 + m, r0, w - m, h, x, wx1, wz0, wz1], on, texel); }
      else { const m = h >> 1, z = wz1 - m * texel; this.piece(out, [c0, r0, w, m, wx0, wx1, z, wz1], on, texel); this.piece(out, [c0, r0 + m, w, h - m, wx0, wx1, wz0, z], on, texel); }
      return;
    }
    const lanes = on.filter(s => s.k === 4), rest = on.filter(s => s.k !== 4);
    out.push([c0, r0, w, h, wx0, wx1, wz0, wz1, [...lanes, ...rest].slice(0, STAMPS_MAX)]);
  }
  // the painting camera over a piece (its world x0, x1, z0, z1): straight down, -z up the picture
  aim(q) {
    const [, , , , wx0, wx1, wz0, wz1] = q, cam = this.cam, mx = (wx0 + wx1) / 2 - ORIGIN.x, mz = (wz0 + wz1) / 2 - ORIGIN.z;
    cam.left = -(wx1 - wx0) / 2; cam.right = (wx1 - wx0) / 2; cam.top = (wz1 - wz0) / 2; cam.bottom = -(wz1 - wz0) / 2;
    cam.position.set(mx, 200, mz); cam.lookAt(mx, 0, mz); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }
  /** How it stands: levels' centres, strips waiting. */
  get busy() { return this.levels.some(L => L.todo.length); }
  dispose() {
    if (this.view?._groundPaint === this) this.view._groundPaint = null;
    if (READ_U.gpT0.value && READ_U.gpT0.value === this.levels[0].rt?.texture) { READ_U.gpOn.value = 0; READ_U.gpT0.value = READ_U.gpT1.value = null; }   // (another one may have taken over)
    for (const L of this.levels) { L.rt?.dispose(); L.rt = null; L.cx = NaN; L.todo.length = 0; }
    for (const pm of this.mats.values()) { pm.gl.dispose(); pm.gpu?.dispose(); }
    for (const s of this.surfaces) s.p.removeFromParent();
    this.surfaces.length = 0; this.stamps.length = 0; this.mats.clear(); this.backend = '';
  }
}
// texels a..b of a picture N wide that wraps round, as [from, to, which wrap] runs inside 0..N
function split(a, b, N) {
  const out = []; let x = a;
  while (x < b) { const w = Math.floor(x / N), s = x - w * N, e = Math.min(N, s + (b - x)); out.push([s, e, w]); x += e - s; }
  return out;
}
