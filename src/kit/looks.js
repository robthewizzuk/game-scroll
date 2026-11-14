// Named look effects for three.js materials: the one way kits change a stock material's shader
// (outdoor air, ground layers, leaf sway...). Kept apart and named so that, when the 3D moves to
// WebGPU (docs/webgpu-move.md), each effect can be rewritten as a TSL node on its own and checked
// against the WebGL one, instead of hunting for shader patches spread through the kits.
//
//   lookPatch(material, 'air', {
//     uniforms: AIR,                                     // shared { name: { value } } objects
//     vertex: [['#include <fog_vertex>', 'after', '  gsW = ...;']],
//     fragment: [['void main() {', 'before', GLSL_FUNCTIONS], ['#include <fog_fragment>', 'replace', code]],
//     vertexHead: 'varying vec3 gsW;\n',                 // put before everything
//   });
//
// Edits are [anchor, 'before' | 'after' | 'replace', code], where code can be a function (anchor) =>
// string. A missing anchor skips that edit; check(shader) => false skips the whole effect (a
// material without fog, say).
// Each material records its effects in material.userData.gsLooks, and three's program cache key gets
// '|gs<name>' per effect so patched and plain materials never share a program. On WebGPU three keys a
// classic material's shader by its settings, not by its nodes, so material.gsGpuKey (a setting only
// that key reads) says whose { value } objects each effect holds: two materials share a shader there
// only when their effects read the same numbers and pictures. Kit use only.

import { Color, DataTexture, Float32BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, ShaderChunk, Vector2, Vector3, Vector4 } from 'three';
import { noiseTex } from './hd3d.js';
import { fbm, rng } from './math.js';
import { ORIGIN_U, ORIGIN_GLSL } from './origin.js';

const EFFECTS = new Map();   // name -> spec, for the WebGPU port and for tests
const SPECS = new WeakMap();   // material -> { name: spec }: the WebGPU version reads each material's own settings

/** The settings a material's effect was added with (for its WebGPU version). */
export const lookSpec = (m, name) => SPECS.get(m)?.[name];

/** The named effects kits have registered (name -> spec). */
export const lookEffects = () => EFFECTS;

/** The effect names on a material. */
export const looksOf = m => m?.userData?.gsLooks || [];

function apply(src, edits) {
  for (const [at, how, code] of edits) {
    if (!src.includes(at)) continue;
    const c = typeof code === 'function' ? code(at) : code;
    src = src.replace(at, how === 'before' ? c + at : how === 'after' ? at + c : c);
  }
  return src;
}

const HOLDERS = new WeakMap(); let holders = 0;
const holderId = u => { if (!u || typeof u !== 'object') return 0; let i = HOLDERS.get(u); if (!i) HOLDERS.set(u, i = ++holders); return i; };

/**
 * Adds a named effect to a material (once). Returns true if it was added now. spec.gpuShared: the
 * effect's WebGPU version reads everything from the material being drawn, so all its materials
 * share one shader there (3D text: a label each).
 */
export function lookPatch(m, name, spec) {
  if (!m) return false;
  const names = m.userData.gsLooks ||= [];
  if (names.includes(name)) return false;
  EFFECTS.set(name, spec);
  names.push(name);
  if (!spec.gpuShared) m.gsGpuKey = (m.gsGpuKey || '') + '|' + name + Object.values(spec.uniforms || {}).map(holderId).join('.');
  let own = SPECS.get(m); if (!own) SPECS.set(m, own = {}); own[name] = spec;
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    base.call(this, sh, r);
    if (spec.check && !spec.check(sh)) return;
    const v = apply(sh.vertexShader, spec.vertex || []), f = apply(sh.fragmentShader, spec.fragment || []);
    if (spec.uniforms) Object.assign(sh.uniforms, spec.uniforms);
    sh.vertexShader = (spec.vertexHead || '') + v;
    sh.fragmentShader = (spec.fragmentHead || '') + f;
  };
  // three caches programs by this key; the default key is the source of onBeforeCompile, so ask the
  // material's own key with its own onBeforeCompile in place
  m.customProgramCacheKey = function () { const cur = this.onBeforeCompile; this.onBeforeCompile = base; try { return baseKey.call(this) + '|gs' + name; } finally { this.onBeforeCompile = cur; } };
  m.needsUpdate = true;
  return true;
}

// ---------------------------------------------------------------- outdoor looks
// Next Gen landscapes that hold up through a scope, for games (gs.outdoors): painted ground
// (meadow, patchwork fields with hedges, lanes, forest floor, rock, river mud, puddles), a ring of
// far hills, rocks with moss, and leaves that sway and glow with the sun behind them. Each is one
// named effect ('ground', 'hills', 'rock', 'leaves') through lookPatch, with its settings as lk...
// uniforms (gs... belongs to the air). See docs/nextgen-3d.md "Outdoor looks".

const uni = v => (v && typeof v === 'object' && 'value' in v ? v : { value: v });
// colours: '#hex' (sRGB, like everywhere in three) or [r, g, b] in linear light
const col = c => uni(c?.isColor ? c : Array.isArray(c) ? new Color().setRGB(...c) : new Color(c));
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const MAX_ROADS = 32;   // road segments looks.ground draws (one fixed shader for every game)
// the outdoor looks are written as { uniforms, world, vertex / fragment: { head, after, before,
// replace } by chunk name }; this turns one into lookPatch's spec. world: true gives the look its
// own world-position varying (instancing included), written vGsWorld in its code.
const AT = c => `#include <${c}>`;
function spec(name, { uniforms, world = false, vertex = {}, fragment = {} }) {
  const wv = 'vLk' + name[0].toUpperCase() + name.slice(1) + 'W', sub = s => s.replaceAll('vGsWorld', wv);
  const edits = o => [
    ...Object.entries(o.replace || {}).map(([c, code]) => [AT(c), 'replace', sub(code)]),
    ...Object.entries(o.after || {}).map(([c, code]) => [AT(c), 'after', '\n' + sub(code)]),
    ...Object.entries(o.before || {}).map(([c, code]) => [AT(c), 'before', sub(code) + '\n']),
  ];
  // (where it is in the world: the drawing's place plus its centre, which moves along with the camera far from the world's own: origin.js)
  const v = edits(vertex), dec = world ? ORIGIN_GLSL + `varying vec3 ${wv};\n` : '';
  if (world) { uniforms.gsOrigin = ORIGIN_U; v.push([AT('project_vertex'), 'after', `\n  ${wv} = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz) + gsOrigin;`]); }
  return { uniforms, vertexHead: dec + (vertex.head || '') + '\n', fragmentHead: dec + sub(fragment.head || '') + '\n', vertex: v, fragment: edits(fragment) };
}

/* ---------- textures made in code ---------- */
// smooth noise that tiles: size x size values in 0..1
function tileNoise(size, base, oct, seed) {
  const out = new Float32Array(size * size); let amp = 1;
  for (let o = 0; o < oct; o++, amp *= .5) {
    const p = base << o, L = new Float32Array(p * p), R = rng(seed * 131 + o * 17);
    for (let i = 0; i < L.length; i++) L[i] = R();
    for (let y = 0; y < size; y++) {
      const fy = y / size * p, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty), r0 = (yi % p) * p, r1 = ((yi + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x / size * p, xi = Math.floor(fx), tx = fx - xi, sx = tx * tx * (3 - 2 * tx), x0 = xi % p, x1 = (xi + 1) % p;
        const a = L[r0 + x0], b = L[r0 + x1], c = L[r1 + x0], d = L[r1 + x1];
        out[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
      }
    }
  }
  let lo = 1e9, hi = -1e9; for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
  return out;
}
function tex(data, size) {
  const t = new DataTexture(data, size, size, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping; t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
}
const pack4 = (size, ...ch) => { const o = new Uint8Array(size * size * 4); for (let i = 0; i < size * size; i++) for (let k = 0; k < 4; k++) o[i * 4 + k] = Math.max(0, Math.min(1, ch[k][i])) * 255; return o; };
function normalsOf(h, size, k = 3) {
  const out = new Uint8Array(size * size * 4), at = (x, y) => h[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out[i] = (-dx / l * .5 + .5) * 255; out[i + 1] = (-dy / l * .5 + .5) * 255; out[i + 2] = (1 / l * .5 + .5) * 255; out[i + 3] = 255;
  }
  return tex(out, size);
}
const cache = new Map();
/**
 * groundDetail({ seed }): tiling textures for close-up ground and rock, made in code (about 60 ms, once
 * per seed). detail: r grass blades and clumps, g pebbles and dirt, b cracks, a broad clumps. normal:
 * bumps to match (use as a normalMap with repeat). ripple: a soft normal map for puddles and water.
 * The textures are shared: clone() one before changing its repeat.
 */
export function groundDetail({ seed = 21 } = {}) {
  if (cache.has(seed)) return cache.get(seed);
  const S = 256, n = S * S, R = rng(seed);
  const clump = tileNoise(S, 8, 4, 5), fine = tileNoise(S, 64, 2, 6), mid = tileNoise(S, 24, 3, 7);
  const blades = new Float32Array(n), peb = new Float32Array(n), crack = new Float32Array(n);
  const put = (a, x, y, v) => { const i = ((y % S + S) % S) * S + ((x % S + S) % S); if (v > a[i]) a[i] = v; };
  for (let i = 0; i < 3400; i++) { let x = R() * S, y = R() * S; const a = R() * Math.PI * 2, len = 2 + R() * 5, v = .35 + R() * .65; for (let k = 0; k < len; k++) { put(blades, x | 0, y | 0, v * (1 - k / len * .6)); x += Math.cos(a); y += Math.sin(a); } }
  for (let i = 0; i < 800; i++) { const cx = R() * S, cy = R() * S, r = .8 + R() * 2.4, v = .3 + R() * .7; for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) { const d = Math.hypot(xx, yy) / r; if (d < 1) put(peb, (cx + xx) | 0, (cy + yy) | 0, v * (1 - d * d)); } }
  const G = 8, pts = []; for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) pts.push([(gx + R()) * S / G, (gy + R()) * S / G]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = Math.floor(x / S * G), cy = Math.floor(y / S * G); let f1 = 1e9, f2 = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const gx = (cx + i + G) % G, gy = (cy + j + G) % G, [px, py] = pts[gy * G + gx], ox = (cx + i - gx) * S / G, oy = (cy + j - gy) * S / G, d = Math.hypot(x - px - ox, y - py - oy); if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
    crack[y * S + x] = Math.min(1, (f2 - f1) / 5);
  }
  const det = [new Float32Array(n), new Float32Array(n), new Float32Array(n), clump], h = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    det[0][i] = clump[i] * .45 + blades[i] * .4 + fine[i] * .15; det[1][i] = mid[i] * .5 + peb[i] * .5; det[2][i] = crack[i] * .65 + mid[i] * .35;
    h[i] = clump[i] * .7 + blades[i] * .35 + peb[i] * .6 + mid[i] * .4;
  }
  const out = ({ detail: tex(pack4(S, ...det), S), normal: normalsOf(h, S, 2.2), ripple: normalsOf(tileNoise(S, 16, 3, 31), S, 1.2) });
  cache.set(seed, out); return out;
}

/* ---------- the looks ---------- */
const GROUND_FNS = `
float lkHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// patchwork: strips of fields in rotated cells; returns the field colour, and the distance to its edge in w
vec4 lkFields(vec2 wp, vec4 dt, vec4 dt2, vec3 grass) {
  float A = lkFieldAngle; vec2 fp = vec2(cos(A) * wp.x - sin(A) * wp.y, sin(A) * wp.x + cos(A) * wp.y);
  fp.x += lkHash(vec2(floor(fp.y / lkFieldSize.y), 3.1)) * lkFieldSize.x;
  vec2 cell = floor(fp / lkFieldSize), f = fract(fp / lkFieldSize);
  float ns = 1. + floor(lkHash(cell) * 3.), si = floor(f.y * ns), sf = fract(f.y * ns), kind = lkHash(cell * 1.7 + si * 13.3 + 2.);
  float edge = min(min(f.x, 1. - f.x) * lkFieldSize.x, min(sf, 1. - sf) * lkFieldSize.y / ns);
  float fz = fp.y * lkFurrows, fur = mix(.5, .5 + .5 * sin(fz), clamp(1. - fwidth(fz) * .35, 0., 1.));
  vec3 c;
  if (kind < .34) c = mix(lkGrassA, lkGrassB, lkHash(cell + 9.)) * (.8 + .4 * dt.r);
  else if (kind < .58) c = lkCropA * (.84 + .26 * fur + .25 * (dt.r - .5)) * (.92 + .16 * lkHash(cell + 2.));
  else if (kind < .72) c = lkPlough * (.66 + .55 * fur) * (.88 + .24 * dt.g);
  else if (kind < .86) c = mix(lkPlough, lkGrassB * 1.1, fur * .85) * (.9 + .2 * dt.r);
  else c = lkCropB * (.84 + .2 * fur + .2 * (dt.g - .5));
  float hw = (lkHedge.w + .7 * dt2.a) * step(.22, lkHash(cell + 4.4)), hedge = 1. - smoothstep(hw - .4, hw + .3, edge);
  c = mix(c, grass, (1. - smoothstep(hw + .3, hw + 1.7, edge)) * .85);
  c = mix(c, lkHedge.rgb * (.55 + .8 * dt.r), hedge);
  return vec4(c, edge);
}
float lkRoadDist(vec2 p) {
  float rd = 1e4;
  for (int i = 0; i < LK_ROADS; i++) { if (i >= lkRoadN) break; vec4 s = lkRoads[i]; vec2 pa = p - s.xy, ba = s.zw - s.xy; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); rd = min(rd, length(pa - ba * h)); }
  return rd;
}`;
const GROUND_COLOUR = `
  float lkRough;
  { vec3 wp = vGsWorld; vec4 dt = texture2D(lkDetail, wp.xz * lkScale.x), dt2 = texture2D(lkDetail, wp.xz * lkScale.y + .37), nz = texture2D(lkNoise, wp.xz * lkScale.z);
    vec3 grass = mix(lkGrassA, lkGrassB, smoothstep(.25, .75, nz.r));
    grass = mix(grass, lkDry, smoothstep(.55, .85, nz.g) * .65) * (.74 + .5 * dt.r * (.7 + .6 * dt2.a));
    vec3 c = grass; lkRough = .95;
    float farm = vLkMask.x * smoothstep(.3, .5, nz.b + .25);
    if (farm > .01 && lkFieldsOn > .5) c = mix(c, lkFields(wp.xz, dt, dt2, grass).rgb, farm);
    c = mix(c, lkForest * (.65 + .55 * dt.a) * (.85 + .3 * dt.g), vLkMask.y);
    float rk = smoothstep(.35, .7, vLkMask.z + (dt2.b - .5) * .5);
    c = mix(c, lkRock * (.6 + .65 * dt.b), rk); lkRough = mix(lkRough, .8, rk);
    c = mix(c, mix(grass, lkDirt, .75) * (.8 + .4 * dt.g), vLkMask.w * smoothstep(.25, .6, dt2.r + nz.a * .4));
    float bank = 1. - smoothstep(lkBank.x, lkBank.y, wp.y + (dt2.r - .5) * 1.2);
    c = mix(c, lkMud * (.65 + .6 * dt.g), bank); lkRough = mix(lkRough, .45, bank * smoothstep(lkBank.z, lkBank.w, wp.y));
    float rd = lkRoadDist(wp.xz) + (dt2.g - .5) * .9, road = 1. - smoothstep(lkRoad.x, lkRoad.y, rd), ruts = smoothstep(.42, .06, abs(rd - lkRoad.z)), crown = 1. - smoothstep(.2, .55, rd);
    vec3 rc = mix(lkDirt * (.8 + .38 * dt.g) * (1. - ruts * .3), grass * .85, crown * .6);
    c = mix(c, rc, road); lkRough = mix(lkRough, .88, road);
    float pud = lkWet * smoothstep(.62, .7, dt2.a * .6 + ruts * road * .5 + nz.g * .3);
    c *= 1. - pud * .45; lkRough = mix(lkRough, .04, pud);
    diffuseColor.rgb = c; }`;

/**
 * looks.ground(material, o): painted ground in world metres. Needs land.masks(...) on the Land that
 * uses the material (fields, forest floor, rock, trodden earth, each 0..1). o: detail (groundDetail().detail),
 * colours: { grassA, grassB, dry, dirt, mud, rock, forest, cropA, cropB, plough, hedge }, fields:
 * { angle, size: [w, d], furrows, hedge } (or false), roads: [[x0, z0, x1, z1], ...] with road:
 * { width, ruts }, bank: { low, high } (mud below this height, shiny lower still), wet: 0..1 (puddles),
 * scale: [close, broad, noise] texture sizes. Returns its uniforms (set .wet.value as it rains).
 */
function ground(m, { detail = groundDetail().detail, colours = {}, fields = {}, roads = [], road = {}, bank = {}, wet = 0, scale = [.26, .047, .0041] } = {}) {
  const C = { grassA: '#55702f', grassB: '#7d8a3c', dry: '#a59a5a', dirt: '#8a7556', mud: '#4a3f30', rock: '#8b877c', forest: '#3e3a26', cropA: '#c2a052', cropB: '#b9a676', plough: '#6a5136', hedge: '#2f4422', ...colours };
  const F = fields === false ? null : { angle: .33, size: [56, 34], furrows: 7, hedge: 1.2, ...fields };
  const nr = roads.length, b = { low: -1.1, high: .8, shiny: -.6, shinier: -1.3, ...bank }, rd = { width: 2.3, edge: .8, ruts: 1.05, ...road };
  const U = {
    lkDetail: uni(detail), lkNoise: uni(noiseTex()), lkWet: uni(wet), lkScale: uni(new Vector3(...scale)),
    lkGrassA: col(C.grassA), lkGrassB: col(C.grassB), lkDry: col(C.dry), lkDirt: col(C.dirt), lkMud: col(C.mud), lkRock: col(C.rock), lkForest: col(C.forest),
    lkCropA: col(C.cropA), lkCropB: col(C.cropB), lkPlough: col(C.plough), lkHedge: uni(new Vector4(...col(C.hedge).value.toArray(), F ? F.hedge : 0)),
    lkFieldAngle: uni(F ? F.angle : 0), lkFieldSize: uni(new Vector2(...(F ? F.size : [56, 34]))), lkFurrows: uni(F ? F.furrows : 7),
    lkBank: uni(new Vector4(b.low, b.high, b.shiny, b.shinier)), lkRoad: uni(new Vector3(rd.width, rd.width + rd.edge, rd.ruts)),
    lkRoads: uni(Array.from({ length: MAX_ROADS }, (_, i) => new Vector4(...(roads[i] || [0, 0, 0, 0])))), lkRoadN: uni(Math.min(nr, MAX_ROADS)), lkFieldsOn: uni(F ? 1 : 0),
  };
  if (nr > MAX_ROADS) console.warn(`looks.ground: ${nr} road segments, only the first ${MAX_ROADS} are drawn`);
  const decl = `#define LK_ROADS ${MAX_ROADS}
uniform sampler2D lkDetail, lkNoise; uniform float lkWet, lkFieldAngle, lkFurrows, lkFieldsOn; uniform int lkRoadN; uniform vec3 lkScale, lkRoad; uniform vec2 lkFieldSize; uniform vec4 lkHedge, lkBank, lkRoads[LK_ROADS];
uniform vec3 lkGrassA, lkGrassB, lkDry, lkDirt, lkMud, lkRock, lkForest, lkCropA, lkCropB, lkPlough; varying vec4 vLkMask;`;
  lookPatch(m, 'ground', spec('ground', {
    uniforms: U, world: true,
    vertex: { head: 'attribute vec4 gsMask; varying vec4 vLkMask;', after: { begin_vertex: '  vLkMask = gsMask;' } },
    fragment: { head: decl + GROUND_FNS, replace: { color_fragment: F ? GROUND_COLOUR : GROUND_COLOUR.replace('if (farm > .01 && lkFieldsOn > .5)', 'if (false)'), roughnessmap_fragment: 'float roughnessFactor = lkRough;' } },
  }));
  return { uniforms: U, get wet() { return U.lkWet.value; }, set wet(v) { U.lkWet.value = v; } };
}

/**
 * looks.hills(material, o): far hillsides that keep their texture through a scope: woods, clearings
 * and bare scree drawn from noise over the vertex colours. o: wood (colour), scale (noise size), woods 0..1.
 */
function hills(m, { wood = [.035, .05, .022], scale = .0019, woods = .55 } = {}) {
  const U = { lkNoise: uni(noiseTex()), lkWood: col(wood), lkHillScale: uni(scale), lkWoods: uni(woods) };
  lookPatch(m, 'hills', spec('hills', {
    uniforms: U, world: true,
    fragment: {
      head: 'uniform sampler2D lkNoise; uniform vec3 lkWood; uniform float lkHillScale, lkWoods;',
      after: { color_fragment: `  { vec3 wp = vGsWorld; vec4 n = texture2D(lkNoise, wp.xz * lkHillScale), m = texture2D(lkNoise, wp.xz * lkHillScale * 5.8 + .31), q = texture2D(lkNoise, wp.xz * lkHillScale * 37. + .7);
    float bare = smoothstep(.62, .85, diffuseColor.b / max(diffuseColor.r, 1e-3)), wood = smoothstep(lkWoods - .05, lkWoods + .05, n.g * .75 + m.r * .4) * (1. - bare);
    diffuseColor.rgb *= .78 + .4 * m.b;
    diffuseColor.rgb = mix(diffuseColor.rgb, lkWood * (.55 + .9 * q.r), wood);
    diffuseColor.rgb *= 1. - bare * .35 * smoothstep(.4, .7, q.g); }` },
    },
  }));
  return { uniforms: U };
}

/**
 * looks.rock(material, o): grit and cracks mapped three ways (no stretching up the sides) over the
 * rock's own colour, and moss where the top faces the sky. o: detail, scale, moss (colour), mossy 0..1.
 */
function rock(m, { detail = groundDetail().detail, scale = .7, moss = [.07, .09, .03], mossy = .85 } = {}) {
  const U = { lkDetail: uni(detail), lkRockScale: uni(scale), lkMoss: col(moss), lkMossy: uni(mossy) };
  lookPatch(m, 'rock', spec('rock', {
    uniforms: U, world: true,
    fragment: {
      head: 'uniform sampler2D lkDetail; uniform float lkRockScale, lkMossy; uniform vec3 lkMoss;',
      before: { emissivemap_fragment: `  { vec3 wp = vGsWorld, wn = transpose(mat3(viewMatrix)) * normal, w = pow(abs(wn), vec3(4.)); w /= w.x + w.y + w.z;
    vec4 d = texture2D(lkDetail, wp.zy * lkRockScale) * w.x + texture2D(lkDetail, wp.xz * lkRockScale) * w.y + texture2D(lkDetail, wp.xy * lkRockScale) * w.z;
    vec4 e = texture2D(lkDetail, wp.xz * lkRockScale * .13 + .2);
    diffuseColor.rgb *= (.66 + .5 * (d.b * .3 + d.g * .4 + d.a * .3)) * (.85 + .3 * e.a);
    float moss = smoothstep(.55, .85, wn.y + (e.r - .5) * .6);
    diffuseColor.rgb = mix(diffuseColor.rgb, lkMoss * (.7 + .6 * d.r), moss * lkMossy); }` },
    },
  }));
  return { uniforms: U };
}

/**
 * looks.leaves(material, o): leaf cards that sway in the wind (more towards the top), light through
 * when you look towards the sun, and keep their outline far away (alpha that thins less in the mips).
 * The material wants a map with alphaTest and DoubleSide. o: time, wind, sun (a direction, Vector3)
 * as numbers or shared uniforms ({ value }), sway, above (metres of trunk that don't sway), glow,
 * atlas: [w, h] of the map in texels. wind can be a gs.outdoors Wind: the trees then lean and stream
 * the way it blows, harder in its gusts. Returns its uniforms: set time and wind each frame (or share them).
 */
// Brushed aside by what passes (a gs.outdoors.Marks grass field: lkPart, lkPartAt as the meadow reads them):
// a leaf leans the way the field there leans, more the higher it is on its plant (lkPartK: metres pushed at
// the top, the height that gets all of it). Added to a world offset sw, at world point wp, h metres up.
const PART_HEAD = '\n#ifdef LK_PART\nuniform sampler2D lkPart; uniform vec4 lkPartAt; uniform vec2 lkPartK;\n#endif';
const PART_GLSL = (h, cap = '1.') => `
#ifdef LK_PART
    { vec2 pd = abs(wp.xz - lkPartAt.xy); vec4 pk = texture2D(lkPart, wp.xz * lkPartAt.z) * step(max(pd.x, pd.y), lkPartAt.w);
      vec2 ln = (pk.rg * 2. - 1.00392) * step(.5, pk.a); float up = smoothstep(0., lkPartK.y, ${h}) * ${cap};
      sw.xz += ln * lkPartK.x * up; sw.y -= length(ln) * lkPartK.x * up * .35; }
#endif`;
// the field a look's material reads (null: none): its picture, where its square lies, and the define that turns the code on
function partOf(m, U, field) {
  U.lkPart.value = field ? field.texture : null; if (field) U.lkPartAt.value = field.where;
  const had = !!m.defines && 'LK_PART' in m.defines; if (!!field !== had) { m.defines ||= {}; if (field) m.defines.LK_PART = ''; else delete m.defines.LK_PART; m.needsUpdate = true; }
}

function leaves(m, { time = 0, wind = .6, sun = new Vector3(0, 1, 0), sway = .012, above = 2, glow = .6, atlas = [1024, 512], part = null, push = [.35, 1.2] } = {}) {
  const W = wind?.uniforms?.lkWindDir ? wind.uniforms : null;
  const U = { lkTime: uni(time), lkWind: W ? W.lkWind : uni(wind), lkWindDir: W ? W.lkWindDir : uni(new Vector2()), lkSun: uni(sun), lkSway: uni(new Vector2(sway, above)), lkGlow: uni(glow), lkAtlas: uni(new Vector2(...atlas)),
    lkPart: uni(null), lkPartAt: uni(new Vector4()), lkPartK: uni(new Vector2(...push)) };
  lookPatch(m, 'leaves', spec('leaves', {
    uniforms: U, world: true,
    vertex: {
      head: 'uniform float lkTime, lkWind; uniform vec2 lkSway, lkWindDir;' + PART_HEAD,
      after: { project_vertex: `  { vec3 wp = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz) + gsOrigin;
    float hh = max(position.y - lkSway.y, 0.), ph = wp.x * .19 + wp.z * .23;
    vec3 sw = vec3(sin(lkTime * 1.7 + ph) + sin(lkTime * 3.1 + ph * 2.3) * .3, 0., cos(lkTime * 1.3 + ph * 1.4)) * lkWind * hh * lkSway.x;
    sw.xz += lkWindDir * lkWind * hh * lkSway.x * (1.2 + .6 * sin(lkTime * .9 + ph * .5));   // a lean downwind (none without a Wind)${PART_GLSL('position.y')}
    mvPosition.xyz += mat3(viewMatrix) * sw; gl_Position = projectionMatrix * mvPosition; }` },
    },
    fragment: {
      head: 'uniform vec3 lkSun; uniform float lkGlow; uniform vec2 lkAtlas;',
      replace: { normal_fragment_begin: ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '') },
      before: {
        alphatest_fragment: '  { vec2 lq = vMapUv * lkAtlas; vec2 dx = dFdx(lq), dy = dFdy(lq); diffuseColor.a *= 1. + max(0., .5 * log2(max(dot(dx, dx), dot(dy, dy)))) * .35; }',
        emissivemap_fragment: '  { vec3 vd = normalize(vGsWorld - gsOrigin - cameraPosition); diffuseColor.rgb *= 1. + lkGlow * pow(max(dot(vd, lkSun), 0.), 4.); }',
      },
    },
  }));
  if (part) partOf(m, U, part);
  return { uniforms: U, part: f => partOf(m, U, f) };
}

// ---- how a frond moves in the wind (looks.fronds; the shaders below do the same sums, frondSway is the reference the kit tests check):
// each leaf is a springy rod held at its root with its own pitch (long palm fronds slow, a fern's short leaves quick; from its length,
// as a cantilever's is) and a little damping. The wind's gusts are frozen turbulence carried downwind (Taylor), so a gust rolls
// through a grove from the upwind trees to the downwind ones; each leaf answers each part of the gust as a damped spring does (a slow
// gust it follows, one near its own pitch it swings with and lags, a quick one it hardly feels), is bent downwind by the wind's drag
// (which grows as the square of the wind) as much as it lies across the wind, and rings at its own pitch, bobbing up and down most at the tip. It bends rather than slides: the leaf turns about its root, more
// further out (a cantilever's shape), so it keeps its length however hard it blows; the leaflets flutter on top.
const GUSTS = [[.09, .5], [.23, .32], [.51, .18]], GUST_RUN = 4, FROND_DAMP = .12;   // (gusts: [Hz, share]; carried downwind at 4 m/s)
/** The numbers frondSway works by (the WebGPU fronds read them too). */
export const FROND = Object.freeze({ GUSTS, RUN: GUST_RUN, DAMP: FROND_DAMP });
const frondPitch = (len, id) => 1.15 / Math.sqrt(Math.max(len, .15)) * (.9 + .2 * ((id * .618) % 1));   // Hz
const frondShape = a => { a = Math.max(a, 1e-3); return (1 - (1 - (1 - a) ** 4) / (4 * a)) / .75; };   // (the chord's turn at a, 1 at the tip)
function turn(v, k, th) {   // v turned th radians about the unit axis k (Rodrigues)
  const c = Math.cos(th), s = Math.sin(th), d = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c);
  return [v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d, v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d, v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d];
}
/**
 * Where a point of a frond moves to in the wind (metres, world): v, the point less its leaf's root; a, how far along the leaf (0..1);
 * id and len (lkFrondId); t, seconds; wind, its strength (looks.fronds' lkWind); dir, which way it blows ([x, z], [0, 0]: no way);
 * sway (lkSway); root, the leaf's root [x, z] (where it is in the gusts). Gives [dx, dy, dz].
 */
export function frondSway(v, a, id, len, t, wind, dir, sway = .08, root = [0, 0], flutter = true) {
  const w0 = 2 * Math.PI * frondPitch(len, id), dl = Math.hypot(dir[0], dir[1]), lean = dl > .5 ? 1 : 0, dx = lean ? dir[0] / dl : .7071, dz = lean ? dir[1] / dl : .7071;
  const along = root[0] * dx + root[1] * dz, across = root[1] * dx - root[0] * dz;
  let g = 0, g2 = 0;
  for (const [f, share] of GUSTS) {
    const w = 2 * Math.PI * f, r = w / w0, H = 1 / Math.sqrt((1 - r * r) ** 2 + (2 * FROND_DAMP * r) ** 2), lag = Math.atan2(2 * FROND_DAMP * r, 1 - r * r), ph = w * t - w * along / GUST_RUN + across * .3;
    g += share * H * Math.cos(ph - lag); g2 += share * Math.cos(ph);
  }
  const ring = Math.sin(w0 * t - w0 * along / GUST_RUN + id * 2.4) * (.55 + .45 * g2), k = wind * sway;
  const bend = Math.max(-1.1, Math.min(1.1, k * (lean * (1.1 + 4 * k) + .9 * g))), flap = k * 1.6 * ring, m = frondShape(a);
  // (bobbing about the level line across the leaf; bent by the drag on it about the line square to it and the wind, as much as it lies
  // across the wind: a leaf pointing downwind streams, one across it swings round, one into it is lifted and pressed back)
  const h = Math.hypot(v[0], v[2]) || 1, vl = Math.hypot(v[0], v[1], v[2]) || 1, fl = turn(v, [-v[2] / h, 0, v[0] / h], flap * m);
  const cx = v[1] * dz / vl, cy = (v[2] * dx - v[0] * dz) / vl, cz = -v[1] * dx / vl, cs = Math.hypot(cx, cy, cz), out = cs > 1e-6 ? turn(fl, [cx / cs, cy / cs, cz / cs], bend * m * cs) : fl;
  if (flutter) out[1] -= k * len * a * a * .12 * Math.sin(t * 8.7 + id * 3.1 + a * 6);
  return [out[0] - v[0], out[1] - v[1], out[2] - v[2]];
}

// frondSway in GLSL (the same sums; the WebGPU one is hd3d-gpu.js gpuLooks.fronds)
const FROND_GLSL = `
vec3 lkTurn(vec3 v, vec3 k, float th) { float c = cos(th), s = sin(th); return v * c + cross(k, v) * s + k * dot(k, v) * (1. - c); }
vec3 lkFrondSway(vec3 v, float a, float id, float len, float t, float wind, vec2 dir, float sway, vec2 root) {
  float w0 = 6.28318 * 1.15 / sqrt(max(len, .15)) * (.9 + .2 * fract(id * .618)), dl = length(dir), lean = step(.5, dl);
  vec2 d = lean > .5 ? dir / dl : vec2(.7071); float along = dot(root, d), across = root.y * d.x - root.x * d.y, g = 0., g2 = 0.;
  ${GUSTS.map(([f, share]) => `{ float w = ${(2 * Math.PI * f).toFixed(5)}, r = w / w0, H = 1. / sqrt((1. - r * r) * (1. - r * r) + ${(2 * FROND_DAMP).toFixed(3)} * r * ${(2 * FROND_DAMP).toFixed(3)} * r), ph = w * t - w * along / ${GUST_RUN.toFixed(1)} + across * .3;
    g += ${share} * H * cos(ph - atan(${(2 * FROND_DAMP).toFixed(3)} * r, 1. - r * r)); g2 += ${share} * cos(ph); }`).join('\n  ')}
  float ring = sin(w0 * t - w0 * along / ${GUST_RUN.toFixed(1)} + id * 2.4) * (.55 + .45 * g2), k = wind * sway;
  float bend = clamp(k * (lean * (1.1 + 4. * k) + .9 * g), -1.1, 1.1), flap = k * 1.6 * ring, aa = max(a, 1e-3), m = (1. - (1. - pow(1. - aa, 4.)) / (4. * aa)) / .75;
  float h = max(length(v.xz), 1e-6), vl = max(length(v), 1e-6); vec3 fl = lkTurn(v, vec3(-v.z / h, 0., v.x / h), flap * m);
  vec3 c = vec3(v.y * d.y, v.z * d.x - v.x * d.y, -v.y * d.x) / vl; float cs = length(c);
  vec3 o = cs > 1e-6 ? lkTurn(fl, c / cs, bend * m * cs) : fl;
  o.y -= k * len * a * a * .12 * sin(t * 8.7 + id * 3.1 + a * 6.);
  return o - v;
}`;
/**
 * looks.fronds(material, o): long leaves that grow out from one point (palm fronds, fan palm and banana
 * leaves, ferns, reeds, ivy, hanging moss, weeds): each a springy rod turning about its root (frondSway: its
 * own pitch, bent by the drag across it, gusts that roll downwind, leaflets that flutter), light comes through
 * towards the sun, outlines hold up far away, and both sides are lit alike.
 * The mesh says, at each point, where its leaf starts and how far along it the point is (lkFrond: x, y, z in
 * the plant's own metres, 0..1 along) and which leaf it is (lkFrondId: a number, its length in metres):
 * gs.models' plants do. o: time, wind (a number, or a gs.outdoors Wind: then they lean and stream the way it
 * blows, harder in its gusts), sun, sway (how far a tip moves per metre of leaf in wind 1: .08), glow, atlas
 * ([w, h] of the map in texels), part (a gs.outdoors.Marks grass field: brushed aside by what walks through)
 * and push ([metres a leaf's tip is pushed, how far along a leaf (metres) it gets all of that]; nothing above
 * 2.6 m, out of a passer-by's reach). Returns { uniforms, part(field) }.
 */
function fronds(m, { time = 0, wind = .6, sun = new Vector3(0, 1, 0), sway = .08, glow = .5, atlas = [128, 256], part = null, push = [.4, 1] } = {}) {
  const W = wind?.uniforms?.lkWindDir ? wind.uniforms : null;
  const U = { lkTime: uni(time), lkWind: W ? W.lkWind : uni(wind), lkWindDir: W ? W.lkWindDir : uni(new Vector2()), lkSun: uni(sun), lkSway: uni(sway), lkGlow: uni(glow), lkAtlas: uni(new Vector2(...atlas)),
    lkPart: uni(null), lkPartAt: uni(new Vector4()), lkPartK: uni(new Vector2(...push)) };
  lookPatch(m, 'fronds', spec('fronds', {
    uniforms: U, world: true,
    vertex: {
      head: 'attribute vec4 lkFrond; attribute vec2 lkFrondId; uniform float lkTime, lkWind, lkSway; uniform vec2 lkWindDir;' + PART_HEAD + FROND_GLSL,
      after: { project_vertex: `  { vec3 wp = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz) + gsOrigin;
    vec4 rm = vec4(lkFrond.xyz, 1.);   // (its leaf's root, put where the point is put)
#ifdef USE_INSTANCING
    rm = instanceMatrix * rm;
#endif
    rm = modelViewMatrix * rm; vec3 rw = transpose(mat3(viewMatrix)) * (rm.xyz - viewMatrix[3].xyz) + gsOrigin;
    float a = lkFrond.w; vec3 sw = lkFrondSway(wp - rw, a, lkFrondId.x, lkFrondId.y, lkTime, lkWind, lkWindDir, lkSway, rw.xz);   // (frondSway, below)${PART_GLSL('a * lkFrondId.y', '(1. - smoothstep(1.8, 2.6, position.y))')}
    mvPosition.xyz += mat3(viewMatrix) * sw; gl_Position = projectionMatrix * mvPosition; }` },
    },
    fragment: {
      head: 'uniform vec3 lkSun; uniform float lkGlow; uniform vec2 lkAtlas;',
      replace: { normal_fragment_begin: ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '') },
      before: {
        alphatest_fragment: '  { vec2 lq = vMapUv * lkAtlas; vec2 dx = dFdx(lq), dy = dFdy(lq); diffuseColor.a *= 1. + max(0., .5 * log2(max(dot(dx, dx), dot(dy, dy)))) * .35; }',
        emissivemap_fragment: '  { vec3 vd = normalize(vGsWorld - gsOrigin - cameraPosition); diffuseColor.rgb *= 1. + lkGlow * pow(max(dot(vd, lkSun), 0.), 4.); }',
      },
    },
  }));
  if (part) partOf(m, U, part);
  return { uniforms: U, part: f => partOf(m, U, f) };
}


/**
 * looks.meadow(material, o): the blades of a gs.outdoors land.meadow(): each tuft shrinks into the ground
 * towards the edge of the patch that travels with the camera (so none pops in or out), bends downwind in
 * gusts that roll across the grass, and is lit alike on both sides. A blade's uv.y runs from its root (0)
 * to its tip (1); the tufts' lkRoot attribute says where each one grows (world metres: the mesh sits at
 * the origin). o: reach: [full size until, gone by] metres from the camera; time, bend (how far a tip
 * leans, in blade heights) and dir (which way: a Vector2) are set each frame by land.update().
 * Grass that parts: the returned part(field) gives the blades a gs.outdoors.Marks grass field to read (one
 * small picture: which way the grass at each spot is pushed over, and how trodden down it is), so they lean
 * away from whoever walks through and lie flat where they were walked on. On WebGPU the blades' shader is
 * built when they are first drawn, so give it the field before then (make the Marks in make()).
 */
function meadow(m, { reach = [12, 24], time = 0, bend = .2, dir = new Vector2(1, 0), part = null } = {}) {
  const U = { lkTime: uni(time), lkBend: uni(bend), lkBendDir: uni(dir), lkMeadow: uni(new Vector2(...reach)), lkPart: uni(null), lkPartAt: uni(new Vector4()), gsOrigin: ORIGIN_U };
  lookPatch(m, 'meadow', spec('meadow', {
    uniforms: U,
    vertex: {
      head: ORIGIN_GLSL + 'attribute vec4 lkRoot; uniform float lkTime, lkBend; uniform vec2 lkBendDir, lkMeadow;\n#ifdef LK_PART\nuniform sampler2D lkPart; uniform vec4 lkPartAt;\n#endif',
      after: { project_vertex: `  { vec3 wp = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz) + gsOrigin, root = lkRoot.xyz;
    float far = smoothstep(lkMeadow.x, lkMeadow.y, distance(root.xz, cameraPosition.xz + gsOrigin.xz));
    vec3 q = root + (wp - root) * (1. - far); float hh = q.y - root.y, t = uv.y;
    float ph = dot(root.xz, lkBendDir) * .35 - lkTime * 2.2, gust = .55 + .3 * sin(ph) + .15 * sin(ph * 2.7 + root.z * .9);
    float b = lkBend * gust * t * hh, fl = hh * t * .05;
#ifdef LK_PART
    // grass that parts (gs.outdoors.Marks): pushed over away from what passes, and lying flat where it was trodden
    { vec2 pd = abs(root.xz - lkPartAt.xy); vec4 pk = texture2D(lkPart, root.xz * lkPartAt.z) * step(max(pd.x, pd.y), lkPartAt.w);
      vec2 ln = (pk.rg * 2. - 1.00392) * step(.5, pk.a); float lm = min(1., length(ln)), dn = min(.92, lm * .62 + pk.b * .9);
      q.xz += ln * 1.1 * hh + (q.xz - root.xz) * pk.b * 1.5; q.y -= hh * dn; b *= 1. - dn; fl *= 1. - dn;
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
      vColor.rgb *= 1. + pk.b * vec3(.34, .3, .12);   // (grass lying flat shows its pale side: a trodden lane reads from above)
#endif
    }
#endif
    q += vec3(lkBendDir.x * b + sin(lkTime * 3.1 + wp.x * 9.) * fl, -b * .35, lkBendDir.y * b + cos(lkTime * 2.6 + wp.z * 9.) * fl);
    mvPosition = viewMatrix * vec4(q - gsOrigin, 1.); gl_Position = projectionMatrix * mvPosition; }` },
    },
    fragment: { replace: { normal_fragment_begin: ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '') } },
  }));
  // the grass field of a gs.outdoors.Marks (null: none): the picture, and where its square lies (a Vector4 the Marks keeps up to date)
  const give = field => {
    U.lkPart.value = field ? field.texture : null; if (field) U.lkPartAt.value = field.where;
    const had = !!m.defines && 'LK_PART' in m.defines; if (!!field !== had) { m.defines ||= {}; if (field) m.defines.LK_PART = ''; else delete m.defines.LK_PART; m.needsUpdate = true; }
  };
  if (part) give(part);
  return { uniforms: U, part: give };
}

/**
 * looks.flow(material, o): moving water for a river or waterfall mesh made by gs.outdoors River (its
 * lkFlow attribute: metres across, metres along, speed, foam; lkDir: which way it runs). Ripples and
 * colour slide downstream at each point's own speed (two crossfaded layers, so faster middles never
 * smear), deeper in the middle, foam at rocks, banks and falls. o: deep, shallow, foam (colours),
 * scale (ripple size), ripple (normal strength), froth (how much foam), time ({ value } or a number).
 */
function flow(m, { deep = [.02, .07, .09], shallow = [.09, .2, .2], foam = [.6, .66, .68], scale = .35, ripple = .45, froth = 1, time = 0 } = {}) {
  const U = { lkNoise: uni(noiseTex()), lkFlowT: uni(time), lkDeep: col(deep), lkShallow: col(shallow), lkFoamC: col(foam), lkFlowK: uni(new Vector4(scale, ripple, froth, 0)) };
  lookPatch(m, 'flow', spec('flow', {
    uniforms: U,
    vertex: {
      head: 'attribute vec4 lkFlow; attribute vec3 lkDir; varying vec4 vLkF; varying vec3 vLkD;',
      after: { begin_vertex: '  vLkF = lkFlow; vLkD = lkDir;' },
    },
    fragment: {
      head: `uniform sampler2D lkNoise; uniform float lkFlowT; uniform vec3 lkDeep, lkShallow, lkFoamC; uniform vec4 lkFlowK; varying vec4 vLkF; varying vec3 vLkD;
vec4 lkFlowN(float sc, vec2 st) {   // noise sliding along at this point's speed, two layers crossfaded
  float p0 = fract(lkFlowT * .5), p1 = fract(lkFlowT * .5 + .5), w = abs(2. * p0 - 1.);
  vec4 a = texture2D(lkNoise, vec2(vLkF.x * st.x, vLkF.y * st.y - vLkF.z * p0 * 2.) * sc);
  vec4 b = texture2D(lkNoise, vec2(vLkF.x * st.x, vLkF.y * st.y - vLkF.z * p1 * 2.) * sc + .37);
  return mix(a, b, w);
}`,
      after: {
        color_fragment: `  vec4 lkN = lkFlowN(lkFlowK.x, vec2(1., .6)), lkS = lkFlowN(lkFlowK.x * 1.7, vec2(2.5, .25));
  float lkFoam = clamp(smoothstep(.55, .85, lkS.g * .55 + vLkF.w * .8 + lkN.r * .25) * lkFlowK.z, 0., 1.);
  diffuseColor.rgb = mix(mix(lkDeep, lkShallow, clamp(vLkD.z * vLkD.z + (lkN.a - .5) * .4, 0., 1.)) * (.85 + .3 * lkN.r), lkFoamC, lkFoam);`,
        roughnessmap_fragment: '  roughnessFactor = mix(.06, .75, lkFoam);',
        normal_fragment_maps: `  { vec2 g = (vec2(lkN.b, lkN.g) - .5) * lkFlowK.y * (1. - lkFoam); vec2 dd = vLkD.xy, pp = vec2(-dd.y, dd.x);
    vec2 gw = dd * g.y + pp * g.x; normal = normalize(normal + (viewMatrix * vec4(gw.x, 0., gw.y, 0.)).xyz); }`,
      },
    },
  }));
  return { uniforms: U };
}

/**
 * looks.lava(material, o): molten rock for a River or pool mesh (same lkFlow attribute): glowing
 * cracks between plates of crust that drift downstream, cooling darker away from the source, a slow
 * throb. o: glow, crust (colours), heat (how bright), cool (0 stays hot all the way, 1 crusts over by
 * the end), scale, time. The glow is emissive, so bloom picks it up.
 */
function lava(m, { glow = [3, .7, .08], crust = [.05, .035, .03], heat = 1, cool = .6, scale = .22, time = 0, length = 100 } = {}) {
  const U = { lkNoise: uni(noiseTex()), lkFlowT: uni(time), lkGlowC: col(glow), lkCrust: col(crust), lkLavaK: uni(new Vector4(scale, heat, cool, length)) };
  lookPatch(m, 'lava', spec('lava', {
    uniforms: U,
    vertex: {
      head: 'attribute vec4 lkFlow; varying vec4 vLkL;',
      after: { begin_vertex: '  vLkL = lkFlow;' },
    },
    fragment: {
      head: `uniform sampler2D lkNoise; uniform float lkFlowT; uniform vec3 lkGlowC, lkCrust; uniform vec4 lkLavaK; varying vec4 vLkL;
vec4 lkLavaN(float sc) {
  float p0 = fract(lkFlowT * .1), p1 = fract(lkFlowT * .1 + .5), w = abs(2. * p0 - 1.);
  vec4 a = texture2D(lkNoise, vec2(vLkL.x, vLkL.y - vLkL.z * p0 * 10.) * sc), b = texture2D(lkNoise, vec2(vLkL.x, vLkL.y - vLkL.z * p1 * 10.) * sc + .53);
  return mix(a, b, w);
}`,
      after: {
        color_fragment: `  vec4 lkN = lkLavaN(lkLavaK.x), lkM = lkLavaN(lkLavaK.x * 3.1);
  float lkHeat = clamp(1. - lkLavaK.z * vLkL.y / max(lkLavaK.w, 1.), 0., 1.) * (.9 + .1 * sin(lkFlowT * 1.3 + lkN.g * 6.));
  float lkCr = abs(lkN.r - .5) * 2. + (lkM.b - .5) * .25, lkCrack = 1. - smoothstep(.02, .05 + lkHeat * .1, lkCr);
  float lkHot = clamp(lkCrack + lkHeat * .2 * smoothstep(.55, .9, lkM.g) + vLkL.w * .5, 0., 1.);
  diffuseColor.rgb = mix(lkCrust * (.6 + .6 * lkM.r), lkGlowC * .05, lkHot);`,
        roughnessmap_fragment: '  roughnessFactor = mix(.9, .5, lkHot);',
        emissivemap_fragment: '  totalEmissiveRadiance += lkGlowC * lkHot * lkHeat * lkLavaK.y;',
      },
    },
  }));
  return { uniforms: U };
}

/**
 * looks.sea(material, o): gs.outdoors.Sea's water (sea.js), from the lkSea attribute it keeps on its points (shore
 * foam, depth, how high and steep the swell is there, the swash's thin film): deep and shallow colours by depth, clear
 * in the shallows, foam cut by a lace where the waves break and on the swell's crests in a fresh wind, a little light
 * through the crests, and fine waves: on WebGL eight short waves running with the wind; on WebGPU an FFT of an ocean's
 * spectrum, with the bottom seen through the water (sea-gpu.js). o: deep, shallow, foam (colours), clear (metres of water
 * that hide the bottom), wind (m/s), dir (radians), fine (how strong the fine waves are), choppy, tile (metres the FFT's
 * waves repeat over), lace (the foam's picture).
 */
function sea(m, { deep = '#0b3550', shallow = '#2a8f9e', foam = '#f2f7f7', clear = 3, wind = 7, dir = 0, fine = 1, choppy = 1.2, tile = 48, lace = null } = {}) {
  const U = { lkSeaT: uni(0), lkDeep: col(deep), lkShallow: col(shallow), lkFoamC: col(foam), lkSeaK: uni(new Vector4(clear, fine, choppy, 0)), lkSeaW: uni(new Vector4(Math.cos(dir), Math.sin(dir), wind, tile)), lkLace: uni(lace) };
  lookPatch(m, 'sea', spec('sea', {
    uniforms: U, world: true,
    vertex: {
      head: 'attribute vec4 lkSea; varying vec4 vLkSea;',
      after: { begin_vertex: '  vLkSea = lkSea;' },
    },
    fragment: {
      head: `uniform float lkSeaT; uniform vec3 lkDeep, lkShallow, lkFoamC; uniform vec4 lkSeaK, lkSeaW; uniform sampler2D lkLace; varying vec4 vLkSea;
vec3 lkSeaFine(vec2 p, float t, float px) {   // eight short waves running round the wind's way: their slopes (xy) and height (z); each fades out where a pixel is too big to show it
  vec2 g = vec2(0.); float h = 0., a0 = atan(lkSeaW.y, lkSeaW.x), sw = smoothstep(1., 9., lkSeaW.z);
  for (int i = 0; i < 8; i++) {
    float fi = float(i), a = a0 + (fract(fi * .618) - .5) * 2.4, L = 5.5 * pow(.7, fi), k = 6.2832 / L, ph = k * dot(p, vec2(cos(a), sin(a))) - sqrt(9.81 * k) * t + fi * 1.7, A = L * .014 * lkSeaK.y * (.35 + .65 * sw) * (1. - smoothstep(L * .12, L * .4, px));
    h += A * sin(ph); g += A * k * cos(ph) * vec2(cos(a), sin(a));
  }
  return vec3(g, h);
}`,
      after: {
        color_fragment: `  float lkPx = length(fwidth(vGsWorld.xz));
  vec3 lkF = lkSeaFine(vGsWorld.xz, lkSeaT, lkPx);
  float lkDepth = vLkSea.y, lkBody = 1. - exp(-max(lkDepth, 0.) / lkSeaK.x), lkFilm = 1. - smoothstep(-.05, .15, lkDepth), lkEdge = smoothstep(0., .03, vLkSea.w);
  float lkCap = smoothstep(.62, .95, max(vLkSea.z, 0.) * .85 + lkF.z * 6.) * smoothstep(5., 11., lkSeaW.z) * (1. - smoothstep(.4, 1.6, lkPx));   // (whitecaps on the steep crests in a fresh wind)
  float lkFoam = clamp(max(vLkSea.x, lkCap), 0., 1.), lkLc = texture2D(lkLace, vGsWorld.xz / 3.).a;
  lkFoam = smoothstep(.36, .62, lkFoam * lkLc * 1.1 + lkFoam * .08);   // (thick foam whole, thin foam in holes and scraps)
  diffuseColor.rgb = mix(mix(lkShallow, lkDeep, lkBody), lkFoamC, lkFoam);
  diffuseColor.a = lkEdge;   // (alphaTest drops the unseen film past the swash's edge; the rest is settled once the normal is known)`,
        roughnessmap_fragment: '  roughnessFactor = mix(.035, .75, lkFoam);',
        normal_fragment_maps: `  normal = normalize(normal + (viewMatrix * vec4(-lkF.x, 0., -lkF.y, 0.)).xyz * (1. - lkFoam));`,
        emissivemap_fragment: `  totalEmissiveRadiance += lkShallow * .18 * max(vLkSea.z, 0.) * (1. - lkFoam) * (1. - lkFilm);   // (light through the thin crests)
  // how much of what is under the water shows through: what the surface lets in (less the lower one looks: Fresnel) times
  // what the water lets through on the way down and back (a longer way, bent, when looking in low)
  float lkCos = clamp(dot(normalize(vViewPosition), normal), 0., 1.), lkFr = .02 + .98 * pow(1. - lkCos, 5.), lkSlant = inversesqrt(max(.05, 1. - (1. - lkCos * lkCos) * .5625));
  diffuseColor.a = max(1. - (1. - lkFr) * exp(-max(lkDepth, 0.) * lkSlant / lkSeaK.x) * mix(.88, .72, lkFilm), lkFoam) * lkEdge;`,
      },
    },
  }));
  return { uniforms: U };
}

/** The outdoor looks: ground, hills, rock, leaves, fronds, meadow, flow, lava, sea (each returns its uniforms). */
export const looks = Object.freeze({ ground, hills, rock, leaves, fronds, meadow, flow, lava, sea });

/**
 * horizon(land, o): a ring of far hills and mountains round the land (they only need light and haze),
 * with the hills look on. o: inner / outer radius, height (of the tallest ridges), seed, lower(x, z)
 * (0..1 to keep a side low, for a view out), colours: { meadow, forest, rock }, segments, rings, look
 * (options for looks.hills, or false). The ring's inner edge meets the land's own edge.
 */
export function horizon(land, { inner = land.size * .47, outer = land.size * 2, height = 320, seed = 9, lower = null, colours = {}, segments = 72, rings = 12, look = {} } = {}) {
  const half = land.size / 2 - 2, C = { meadow: '#6a7240', forest: '#3d4a2c', rock: '#7d7f78', ...colours };
  const pos = [], cols = [], idx = [], c = new Color(), meadow = new Color(C.meadow), forest = new Color(C.forest), rockC = new Color(C.rock);
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, f = j / rings, r = inner + (outer - inner) * f * f, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const inside = Math.abs(x) < half && Math.abs(z) < half;
    const ridge = (fbm(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2 + f * 3, 4) * .6 + .4) * (height * .19 + height * .81 * sm(.15, 1, f)) * sm(.02, .35, f);
    const edge = inside ? land.height(x, z) - 4 : land.height(Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, z)));
    const y = inside ? edge : edge + ridge * (lower ? 1 - lower(x, z) : 1);
    pos.push(x, y, z);
    c.copy(meadow).lerp(forest, sm(10, 60, y - edge)).lerp(rockC, sm(140, 260, y)); cols.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) { const a = j * (segments + 1) + i, b = a + segments + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('color', new Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  if (look !== false) hills(mat, look);
  const m = new Mesh(g, mat); m.receiveShadow = false; m.userData.noAO = true;
  return m;
}
