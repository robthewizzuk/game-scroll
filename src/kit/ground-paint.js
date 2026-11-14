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
// both, each change dithered over a band so no line shows. Colour is kept as its square root (no banding in the
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
export const PAINT_KINDS = { asphalt: 0, paving: 1, plaza: 2, grass: 3 };
const STAMP_KINDS = { oil: 0, skid: 1, scorch: 2 };
export const STAMPS_MAX = 16;   // stamps one strip's paint can take (the nearest to it)

/* ---------- the paint, GLSL (ground-paint-gpu.js has it as nodes) ---------- */
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
uniform vec4 gpStampA[${STAMPS_MAX}]; uniform vec4 gpStampB[${STAMPS_MAX}]; uniform float gpStampN;
// the ground at p (metres, the world's own): its colour (linear) and roughness, from its base colour and kind
vec4 gpPaint(vec2 p, vec3 base, float kind) {
  vec3 c = base * (.84 + .32 * gpF(p * .07)); float r = .86;
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
  } else if (kind < 2.5) {   // paving slabs (.6 m) or a plaza's flags (1.2 m), laid in a bond: joints, a few cracked or new, gum, stains
    float S = kind < 1.5 ? .6 : 1.2; vec2 q = p / S; q.x += step(1., mod(floor(q.y), 2.)) * .5; vec2 id = floor(q), f = fract(q);
    float hs = gpH(id + 7.); c *= .9 + .2 * hs; if (hs > .97) c *= .8;
    float j = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)) * S, joint = 1. - smoothstep(.004, .01, j);
    if (gpH(id + 13.) < .07) { float a = gpH(id + 1.), b = gpH(id + 2.); float d = abs((f.x - mix(a, b, f.y)) + .04 * (gpN(q * 9.) - .5)) * S; joint = max(joint, (1. - smoothstep(.002, .006, d)) * .8); }
    float fine = gpN(p * 60.); c *= (.94 + .12 * fine) * (1. - .45 * joint); r = mix(r + .04, 1., joint);
    vec2 gc = floor(p * 1.1); if (gpH(gc + 3.) < .25) { vec2 gp = (gc + vec2(gpH(gc + 4.), gpH(gc + 5.))) / 1.1; c = mix(c, base * .25, (1. - smoothstep(.008, .014, length(p - gp))) * .8); }
    float st = gpStain(p, 2.6, .1, 47.); c *= 1. - .3 * st; r = mix(r, .7, st * .5);
  } else {   // grass: patches of it greener and browner
    c *= .85 + .3 * gpN(p * 1.3); r = 1.;
  }
  // the stamps on this strip: oil, skid marks, scorches
  for (int i = 0; i < ${STAMPS_MAX}; i++) {
    if (float(i) >= gpStampN) break;
    vec4 A = gpStampA[i], B = gpStampB[i]; vec2 d = p - A.xy; float cs = cos(A.w), sn = sin(A.w);
    vec2 l = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y) / A.z; float s = 0., n = gpN(p * 3. + B.w);
    if (B.x < .5) { s = 1. - smoothstep(.5, 1., length(l) * (1. + .3 * n)); c *= 1. - .5 * s * B.y; r = mix(r, .45, s); }
    else if (B.x < 1.5) { float dy = abs(abs(l.y * A.z) - B.z * .5); s = (1. - smoothstep(.06, .1, dy)) * smoothstep(-1., -.8, l.x) * (1. - smoothstep(.6, 1., l.x)) * (.6 + .4 * gpN(p * 20.)); c *= 1. - .6 * s * B.y; }
    else { s = 1. - smoothstep(.2, 1., length(l) * (1. + .4 * n)); c = mix(c, c * .15, s * B.y); r = mix(r, .95, s); }
  }
  return vec4(max(c, 0.), clamp(r, .05, 1.));
}`;

const PAINT_VERT = ORIGIN_GLSL + `varying vec2 vGpW;
void main() { vec4 w = modelMatrix * vec4(position, 1.); vGpW = w.xz + gsOrigin.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const PAINT_FRAG = `varying vec2 vGpW; uniform vec4 gpBase;
${PAINT_GLSL}
void main() { vec4 g = gpPaint(vGpW, gpBase.rgb, gpBase.w); gl_FragColor = vec4(sqrt(g.rgb), g.a); }`;

// the stamps' uniforms, shared by every paint material (set for each strip)
const STAMP_U = { gpStampA: { value: Array.from({ length: STAMPS_MAX }, () => new Vector4()) }, gpStampB: { value: Array.from({ length: STAMPS_MAX }, () => new Vector4()) }, gpStampN: { value: 0 } };
function paintMatGL(base, kind) {
  return new ShaderMaterial({ uniforms: { ...STAMP_U, gpBase: { value: new Vector4(base.r, base.g, base.b, kind) }, gsOrigin: ORIGIN_U }, vertexShader: PAINT_VERT, fragmentShader: PAINT_FRAG, depthTest: false, depthWrite: false });
}

/* ---------- reading it: the ground's own material ---------- */
// (L: the two levels' centres and sizes, world metres: x0, z0 of the fine one, its size, the coarse one's size; L2: the coarse one's centre;
// the levels hold sqrt(colour) and roughness; past both the material's own map)
const READ_HEAD = ORIGIN_GLSL + `varying vec3 vGpRW;
uniform sampler2D gpT0, gpT1; uniform vec4 gpL, gpL2; uniform float gpOn;
float gpDither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
`;
const READ = `
  float gpRough = -1.;
  {
    vec2 gp = vGpRW.xy, gq = vec2(gp.x, -gp.y), gx = dFdx(gq), gy = dFdy(gq); float dz = gpDither(gl_FragCoord.xy);   // (the pictures' v runs along -z: painter's note)
    float m0 = max(abs(gp.x - gpL.x), abs(gp.y - gpL.y)) / (gpL.z * .5), m1 = max(abs(gp.x - gpL2.x), abs(gp.y - gpL2.y)) / (gpL.w * .5);
    vec4 g = vec4(-1.);
    bool up = gpOn > .5 && vGpRW.z > .7;   // (a face that looks up)
    if (up && m0 < mix(.8, .95, dz)) g = textureGrad(gpT0, gq / gpL.z, gx / gpL.z, gy / gpL.z);
    else if (up && m1 < mix(.82, .97, dz)) g = textureGrad(gpT1, gq / gpL.w, gx / gpL.w, gy / gpL.w);
    if (g.x >= 0.) { diffuseColor.rgb *= g.rgb * g.rgb; gpRough = g.a; }
#ifdef USE_MAP
    else diffuseColor *= texture2D(map, vMapUv);
#endif
  }`;
// what the ground's materials read (one set for all of them: the ground paint at work)
const READ_U = { gpT0: { value: null }, gpT1: { value: null }, gpL: { value: new Vector4() }, gpL2: { value: new Vector4() }, gpOn: { value: 0 }, gsOrigin: ORIGIN_U };
function readLook(m) {
  lookPatch(m, 'groundpaint', {
    uniforms: READ_U,
    vertexHead: READ_HEAD,
    vertex: [['#include <project_vertex>', 'after', '\n  { vec4 gpw = modelMatrix * vec4(transformed, 1.); vGpRW = vec3(gpw.xz + gsOrigin.xz, normalize(mat3(modelMatrix) * objectNormal).y); }']],
    fragmentHead: READ_HEAD,
    fragment: [['#include <map_fragment>', 'replace', READ], ['#include <roughnessmap_fragment>', 'after', '\n  if (gpRough >= 0.) roughnessFactor = gpRough;']],
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
  /** A mark on the ground (x, z: the world's own metres): 'oil' (size: across), 'skid' (size: long; track: between the wheels), 'scorch'. strength 0..1. */
  stamp(x, z, kind = 'oil', { size = 1, angle = 0, strength = 1, track = 1.5, seed = Math.random() * 100 } = {}) {
    const s = { x, z, r: kind === 'skid' ? size / 2 + track : size * .6, A: new Vector4(x, z, size * .5, angle), B: new Vector4(STAMP_KINDS[kind] ?? 0, strength, track, seed) };
    this.stamps.push(s); this.dirty(x - s.r, z - s.r, x + s.r, z + s.r);
    return s;
  }
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
  // paints a rectangle of the world (inside the level) into its texels: split where the picture wraps round
  paint(L, x0, z0, x1, z1, r, G) {
    const S = L.size, N = L.px, tx = v => v / S * N;
    // the stamps near it (the nearest, as many as one paint takes)
    const near = this.stamps.filter(s => s.x + s.r > x0 && s.x - s.r < x1 && s.z + s.r > z0 && s.z - s.r < z1).slice(0, STAMPS_MAX);
    near.forEach((s, i) => { STAMP_U.gpStampA.value[i].copy(s.A); STAMP_U.gpStampB.value[i].copy(s.B); }); STAMP_U.gpStampN.value = near.length;
    // texel columns (x) and rows (-z), wrapped: [c0, r0, width, height, and the world under them: x0, x1, z0, z1]
    const pieces = [], cols = split(Math.round(tx(x0)), Math.round(tx(x1)), N), rows = split(Math.round(tx(-z1)), Math.round(tx(-z0)), N);
    for (const [c0, c1, cw] of cols) for (const [r0, r1, rw] of rows) pieces.push([c0, r0, c1 - c0, r1 - r0, (c0 + cw * N) / N * S, (c1 + cw * N) / N * S, -(r1 + rw * N) / N * S, -(r0 + rw * N) / N * S]);
    if (!pieces.length) return;
    // (nothing cleared: the ground under the whole of it is painted over what was there, lowest first; mipmaps made after the last piece)
    if (G) G.fx.groundPaintRender(r, this, L, pieces, STAMP_U);
    else {
      const rt = L.rt, was = { rt: r.getRenderTarget(), auto: r.autoClear };
      for (const s of this.surfaces) s.p.material = s.p.userData.paint.gl;
      try {
        r.autoClear = false;
        pieces.forEach((q, i) => { this.aim(q); rt.viewport.set(q[0], q[1], q[2], q[3]); rt.scissor.copy(rt.viewport); rt.scissorTest = true; rt.texture.generateMipmaps = i === pieces.length - 1; r.setRenderTarget(rt); r.render(this.scene, this.cam); });
      } finally { rt.viewport.set(0, 0, N, N); rt.scissor.set(0, 0, N, N); rt.scissorTest = false; rt.texture.generateMipmaps = true; r.setRenderTarget(was.rt); r.autoClear = was.auto; }
    }
    for (const q of pieces) { this.info.strips++; this.info.texels += q[2] * q[3]; }
    this.info.painted++;
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
