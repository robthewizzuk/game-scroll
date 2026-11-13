// What a car's paint and glass look like up close, as two named looks on their own materials (looks.js
// lookPatch): 'carpaint' and 'carglass'. vehicles.js gives them to a car's paint, its glass and its lamps;
// vehicle-gpu.js is the same sums as nodes (hd3d-gpu.js gpuLooks), so they draw alike on WebGL and WebGPU.
//
// carpaint:
//   flakes   metal flakes in the paint under the clear coat: each a tiny tilted mirror that catches the light,
//            seen close up (gone once one is smaller than a pixel, where the paint's own sheen takes over); and
//            the flop of metallic paint (brighter face on, darker edge on), at any distance.
//   dirt     road dirt that builds up: first on the sills, behind the wheels and on the tail, then up the sides
//            in streaks, and as dust on the flat tops; it dulls the paint and takes away the clear coat.
//   wet      rain beading on the clear coat: drops, rounder and closer on flat tops, fewer and drawn out on the
//            sides, each a little dome of water that catches its own highlight. Follows the weather (gs.sky.
//            Weather, or the view's own wet) unless a car says how wet it is.
// carglass:
//   see      glass that is see-through face on and a mirror edge on (its opacity follows the angle, as glass does).
//   hits     up to four places it was hit: a laminated screen crazes (a star of cracks and rings round the
//            point, milky), a side window is holed (gone round the point, with a jagged crazed edge); a lamp's
//            glass goes dark and cracked.
//   dirt     a film on it, with the wipers' two clean fans on the windscreen; wet: drops, fewer in the fans.
//
// The patterns are worked out in the car's own space (its points, before any copy's place), so they ride with it
// and match on every copy. Kit use only.
import { Vector4 } from 'three';
import { lookPatch, looksOf, lookSpec } from '../looks.js';

const v4 = (a = 0, b = 0, c = 0, d = 0) => ({ value: new Vector4(a, b, c, d) });

/**
 * Gives a car's paint material its look. flakes (0..1: how metallic), dirt (0..1), wet (0..1: its own
 * beading; in the rain the view's air beads every smooth thing by itself), seed, size: [length, height, ground clearance] of the car (where its sills and tail are). Returns its
 * uniforms (gsCpA: flakes, dirt, wet, seed; gsCpB: length, height, clearance; gsCpX: four scrapes x, y, z, radius
 * where it was knocked, gsCpXK: how bad each is).
 */
export function carPaint(m, { flakes = 0, dirt = 0, wet = 0, seed = 0, size = [4.5, 1.45, .18] } = {}) {
  const U = { gsCpA: v4(flakes, dirt, wet, (seed * 7.31) % 61), gsCpB: v4(size[0], size[1], size[2], 0), gsCpX: { value: [0, 1, 2, 3].map(() => new Vector4(0, 0, 0, 0)) }, gsCpXK: v4() };
  lookPatch(m, 'carpaint', {
    uniforms: U,
    vertexHead: VERT_HEAD,
    vertex: [['#include <begin_vertex>', 'after', VERT]],
    fragmentHead: COMMON + PAINT_HEAD,
    fragment: [
      ['#include <normal_fragment_maps>', 'after', PAINT],
      ['#include <clearcoat_normal_fragment_maps>', 'after', '\n#ifdef USE_CLEARCOAT\n  if (gsCpBeadK > 0.) clearcoatNormal = normalize(clearcoatNormal + gsCpTilt);\n#endif'],
      ['#include <lights_physical_fragment>', 'after', '\n#ifdef USE_CLEARCOAT\n  material.clearcoat *= 1. - gsCpDm; material.clearcoatRoughness = mix(material.clearcoatRoughness, .55, gsCpDm);\n#endif'],
    ],
  });
  return U;
}

/**
 * Gives a car's glass (or a lamp's) its look. see: its opacity face on (glass: .3 to .5; a lamp: -1, opaque),
 * dirt, wet (as carPaint), seed, size (as carPaint), screen: [x of the left wiper's foot, y, z, reach] (the
 * windscreen's two wiper fans; reach 0: none). Returns its uniforms (gsCgA: dirt, wet, see, seed; gsCgH: four hits
 * x, y, z, radius; gsCgK: each hit's kind, 1 crazed, 2 holed, 3 a broken lamp; gsCgS: the wipers).
 */
export function carGlass(m, { see = .4, dirt = 0, wet = 0, seed = 0, size = [4.5, 1.45, .18], screen = [0, 0, 0, 0] } = {}) {
  const U = {
    gsCgA: v4(dirt, wet, see, (seed * 3.17) % 53), gsCgS: v4(...screen), gsCpB: v4(size[0], size[1], size[2], 0),
    gsCgH: { value: [0, 1, 2, 3].map(() => new Vector4(0, 0, 0, 0)) }, gsCgK: v4(),
  };
  lookPatch(m, 'carglass', {
    uniforms: U,
    vertexHead: VERT_HEAD,
    vertex: [['#include <begin_vertex>', 'after', VERT]],
    fragmentHead: COMMON + GLASS_HEAD,
    fragment: [
      ['#include <normal_fragment_maps>', 'after', GLASS],
      ['#include <emissivemap_fragment>', 'after', '\n  totalEmissiveRadiance *= 1. - gsCgDark;'],
      ['#include <opaque_fragment>', 'before', '  if (gsCgA.z > 0.) diffuseColor.a = gsCgAlpha;\n'],
    ],
  });
  return U;
}

/** A copy of a material with a car look of its own (fresh uniforms, set from the old ones): for one car's dirt or damage. */
export function ownLook(m) {
  const ud = m.userData; m.userData = {};   // (three copies userData through JSON)
  let c; try { c = m.clone(); } finally { m.userData = ud; }
  c.userData = { ...ud }; delete c.userData.gsLooks;
  for (const n of looksOf(m)) {
    const s = lookSpec(m, n); if (!s) continue;
    if (n === 'carpaint' || n === 'carglass') {
      const A = n === 'carpaint' ? s.uniforms.gsCpA.value : s.uniforms.gsCgA.value, B = s.uniforms.gsCpB.value;
      const U = n === 'carpaint' ? carPaint(c, { flakes: A.x, dirt: A.y, wet: A.z, size: [B.x, B.y, B.z] })
        : carGlass(c, { dirt: A.x, wet: A.y, see: A.z, size: [B.x, B.y, B.z], screen: s.uniforms.gsCgS.value.toArray() });
      if (n === 'carpaint') { U.gsCpA.value.w = A.w; U.gsCpXK.value.copy(s.uniforms.gsCpXK.value); s.uniforms.gsCpX.value.forEach((h, i) => U.gsCpX.value[i].copy(h)); } else { U.gsCgA.value.w = A.w; U.gsCgK.value.copy(s.uniforms.gsCgK.value); s.uniforms.gsCgH.value.forEach((h, i) => U.gsCgH.value[i].copy(h)); }
    } else lookPatch(c, n, s);
  }
  return c;
}
/** A material's car look uniforms (null when it has none). */
export const lookOf = m => lookSpec(m, 'carpaint')?.uniforms || lookSpec(m, 'carglass')?.uniforms || null;

// ---------------------------------------------------------------- the sums (vehicle-gpu.js has them as nodes: change both)
const VERT_HEAD = 'varying vec3 vGsCp, vGsCpN, vGsCpT;\n';
// the car's own point and normal, and its sideways direction (level, along the surface) turned as the normal is
const VERT = `
  vGsCp = position; vGsCpN = objectNormal;
  { vec3 gsT = abs(objectNormal.y) < .95 ? cross(vec3(0., 1., 0.), objectNormal) : vec3(1., 0., 0.);
#ifdef USE_INSTANCING
    gsT = mat3(instanceMatrix) * gsT;
#endif
    vGsCpT = normalMatrix * gsT; }`;
const COMMON = `varying vec3 vGsCp, vGsCpN, vGsCpT; uniform vec4 gsCpB;
float gsCpH(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float gsCpN3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(gsCpH(i), gsCpH(i + vec3(1., 0., 0.)), f.x), mix(gsCpH(i + vec3(0., 1., 0.)), gsCpH(i + vec3(1., 1., 0.)), f.x), f.y),
    mix(mix(gsCpH(i + vec3(0., 0., 1.)), gsCpH(i + vec3(1., 0., 1.)), f.x), mix(gsCpH(i + vec3(0., 1., 1.)), gsCpH(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }
// a drop of water on the surface at p (the surface's own normal n): its dome's slope (across, along), 0 off a drop;
// rim: how near its edge (darker there). density 0..1, k: how many to a metre.
vec2 gsCpDrop(vec3 p, vec3 n, float density, float k, out float rim) {
  vec3 t = abs(n.y) < .95 ? normalize(cross(vec3(0., 1., 0.), n)) : vec3(1., 0., 0.), b = cross(n, t);
  float side = 1. - smoothstep(.3, .8, abs(n.y));
  vec2 q = vec2(dot(p, t), dot(p, b)) * vec2(k, k * mix(1., .62, side)), c = floor(q), f = fract(q) - .5;
  float r = .17 + .26 * gsCpH(vec3(c, 13.)), on = step(gsCpH(vec3(c, 7.)), density * (1. - .45 * side));
  vec2 d = (f - (vec2(gsCpH(vec3(c, 3.)), gsCpH(vec3(c, 5.))) - .5) * (1. - 2. * r)) / r; float l = dot(d, d);
  on *= step(l, 1.); rim = on * smoothstep(.45, 1., l);
  return on * d;
}
// how wet: the car's own (the weather's rain beads it through the view's air, AIR_WET in hd3d.js)
float gsCpWet(float own) { return max(own, 0.); }
// the surface's two directions in view space (across, along), from the vertex's sideways one
vec3 gsCpT, gsCpB2;
void gsCpFrame(vec3 N) { gsCpT = normalize(vGsCpT - N * dot(vGsCpT, N) + 1e-6); gsCpB2 = cross(N, gsCpT); }
`;
const PAINT_HEAD = `uniform vec4 gsCpA, gsCpXK; uniform vec4 gsCpX[4];
vec3 gsCpTilt; float gsCpDm, gsCpBeadK;
`;
// (in main: it changes the normal, the colour, how rough and how metal, which are main's own)
const PAINT = `
{
  gsCpTilt = vec3(0.); gsCpDm = 0.; gsCpBeadK = 0.;
  float gsWet = gsCpWet(gsCpA.z);
  if (gsCpA.x + gsCpA.y + gsWet + gsCpXK.x > 0.) {
  vec3 p = vGsCp, n = normalize(vGsCpN); gsCpFrame(normal);
  float fpm = length(fwidth(p));   // metres a pixel
  // scrapes where it was knocked: the paint rubbed through to grey primer and bright metal, in streaks along the car
  float gsScuff = 0., gsBare = 0.;
  for (int i = 0; i < 4; i++) {
    vec4 h = gsCpX[i]; if (h.w <= 0.) continue;
    float d = length(p - h.xyz) / h.w; if (d >= 1.) continue;
    vec3 t = abs(n.y) < .95 ? normalize(cross(vec3(0., 1., 0.), n)) : vec3(1., 0., 0.);
    float a = dot(p, t), st = gsCpN3(vec3(a * 1.3, p.y * 75., float(i) * 5.)) * .7 + gsCpN3(vec3(a * 4., p.y * 160., float(i) * 5. + 2.)) * .3;
    float st2 = gsCpN3(vec3(a * 2., p.y * 260., float(i) * 5. + 9.)), k = gsCpXK[i], core = 1. - smoothstep(.15, .9, d);
    gsScuff = max(gsScuff, smoothstep(.5, .56, st + core * .42 - .2 * d) * core * k);
    gsBare = max(gsBare, smoothstep(.74, .78, st2 + core * .3) * core * k);
  }
  if (gsScuff + gsBare > 0.) {
    diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(.42, .42, .41), gsScuff * .85), vec3(.62, .63, .64), gsBare);
    roughnessFactor = mix(roughnessFactor, mix(.65, .3, gsBare), max(gsScuff, gsBare)); metalnessFactor = mix(metalnessFactor, .85, gsBare);
    gsCpDm = max(gsScuff, gsBare);
  }
  // dirt: where it gathers first (low down, the tail, the flat tops), in blotches and streaks running down
  if (gsCpA.y > 0.) {
    float y = clamp((p.y - gsCpB.z) / max(gsCpB.y - gsCpB.z, .3), 0., 1.), low = 1. - smoothstep(0., .55, y), tail = smoothstep(.1, .5, p.z / gsCpB.x);
    float big = gsCpN3(p * 1.4 + gsCpA.w), fine = gsCpN3(p * vec3(13., 2.2, 13.) + gsCpA.w), speck = gsCpN3(p * 38. + gsCpA.w);
    // road grime: thick low down and behind, in streaks thrown up; dust: a thin even film, thicker on flat tops
    float grime = low * (.55 + .45 * fine) + tail * .3 + (big - .5) * .25, dust = .35 + .3 * big + smoothstep(.6, .92, n.y) * .3 + (speck - .5) * .15;
    float a = gsCpA.y, g = smoothstep(1. - a * 1.1, 1.25 - a * 1.1, grime) * .9, f = smoothstep(.2, .9, dust * a * 1.4) * .55;
    float dm = max(g, f);
    diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(.47, .43, .37) * (.9 + .2 * speck), f), vec3(.2, .17, .13) * (.8 + .4 * fine), g);
    roughnessFactor = mix(roughnessFactor, .92, dm); metalnessFactor *= 1. - dm; gsCpDm = max(gsCpDm, dm);
  }
  // flakes: a fine size close up, a coarser one further off, each faded out once it is smaller than a pixel
  if (gsCpA.x > 0. && gsCpDm < .9) {
    float vis = gsCpA.x * (1. - smoothstep(.45, 1.2, fpm * 320.)) * (1. - gsCpDm);
    vec3 c = floor(p * 320.) + gsCpA.w;
    if (vis > .01 && gsCpH(c) < .3) {
      vec2 r = vec2(gsCpH(c + 17.3), gsCpH(c + 41.9)) * 2. - 1.;
      normal = normalize(normal + (r.x * gsCpT + r.y * gsCpB2) * .2 * vis);
      metalnessFactor = mix(metalnessFactor, .9, vis * .6); roughnessFactor = mix(roughnessFactor, .16, vis * .6);
    }
    float nv = clamp(dot(normal, normalize(vViewPosition)), 0., 1.);
    diffuseColor.rgb *= mix(1., .6 + .55 * nv, gsCpA.x * (1. - gsCpDm));   // (the flop)
  }
  // rain beading on the coat: drops while they are bigger than a pixel, a wet sheen past that
  if (gsWet > 0.) {
    float vis = 1. - smoothstep(.6, 1.3, fpm * 65.), rim;
    roughnessFactor = mix(roughnessFactor, .1, gsWet * .5 * (1. - gsCpDm));
    if (vis > 0.) {
      vec2 d = gsCpDrop(p, n, mix(.18, .5, gsWet), 65., rim) * vis;
      if (dot(d, d) > 0.) { gsCpBeadK = 1.; gsCpTilt = (d.x * gsCpT + d.y * gsCpB2) * .9; diffuseColor.rgb *= 1. - rim * .3;
#ifndef USE_CLEARCOAT
        normal = normalize(normal + gsCpTilt); roughnessFactor = .05;
#endif
      }
    }
  }
  }
}`;
const GLASS_HEAD = `uniform vec4 gsCgA, gsCgS, gsCgK; uniform vec4 gsCgH[4];
float gsCgAlpha, gsCgDark;
`;
const GLASS = `
{
  gsCgAlpha = gsCgA.z; gsCgDark = 0.;
  vec3 p = vGsCp, n = normalize(vGsCpN); gsCpFrame(normal);
  float fpm = length(fwidth(p)), lamp = step(gsCgA.z, 0.), crack = 0.;
  // the hits: cracks running out from each (a star of them, broken rings), crushed white where it struck; a side
  // window holed, the glass left at its edge crazed into little pieces; a lamp dark
  for (int i = 0; i < 4; i++) {
    vec4 h = gsCgH[i]; float kind = gsCgK[i], fi = float(i);
    if (h.w <= 0.) continue;
    vec3 v = p - h.xyz; float d = length(v), r = h.w;
    vec3 t = abs(n.y) < .95 ? normalize(cross(vec3(0., 1., 0.), n)) : vec3(1., 0., 0.), b = cross(n, t);
    vec2 g = vec2(dot(v, t), dot(v, b));
    float a = atan(g.y, g.x), lw = max(fpm, .0008);
    float edge = kind > 1.5 && kind < 2.5 ? r * (.72 + .5 * (gsCpN3(vec3(a * 2.2, fi * 7., 1.)) - .5)) : 0.;
    if (d < edge) discard;   // the pane is gone here
    float reach = kind > 2.5 ? r * 1.15 : kind > 1.5 ? r * 1.35 : r * 2.2;
    if (d > reach) continue;
    float fade = 1. - smoothstep(r * .2, reach, d);
    // the star: a dozen cracks, each wandering a little as it runs out, some sectors with none
    float u = a * 1.91 + .3 * gsCpN3(vec3(d * 7., fi, 3.)) + fi * .37, arc = abs(fract(u) - .5) / 1.91 * d;
    float star = (1. - smoothstep(lw * .4, lw * 1.4, arc)) * step(.2, gsCpH(vec3(floor(u), fi, 1.))) * step(edge, d);
    // rings: pieces of circles round it, closer together near it
    float q = sqrt(d / r) * 7. + .5 * gsCpN3(vec3(a * 3., fi, 5.)), ring = (1. - smoothstep(lw * .4, lw * 1.4, abs(fract(q) - .5) / 7. * 2. * sqrt(d * r)));
    ring *= step(.5, gsCpH(vec3(floor(a * 2.6 + q), floor(q), fi)));
    // crazed: the glass left round a hole broken into little pieces (milky, too small to draw one by one), crushed white where it struck
    float craze = kind > 1.5 && kind < 2.5 ? (1. - smoothstep(0., r * .22, d - edge)) * .5 : 1. - smoothstep(r * .04, r * .16, d);
    crack = max(crack, max(max(star, ring * .85) * fade, craze * .9));
    if (kind > 2.5) gsCgDark = max(gsCgDark, 1. - smoothstep(r * .6, r * 1.05, d));
  }
  // a film of dirt, wiped clean in two fans on the windscreen
  float film = 0.;
  if (gsCgA.x > 0.) {
    float wiped = 0.;
    if (gsCgS.w > 0. && n.z < -.3) for (int s = 0; s < 2; s++) { vec3 f = vec3(gsCgS.x + float(s) * .62, gsCgS.y, gsCgS.z); vec3 q = p - f; wiped = max(wiped, (1. - smoothstep(gsCgS.w - .05, gsCgS.w, length(q))) * step(f.y, p.y)); }
    float big = gsCpN3(p * 3. + gsCgA.w), th = 1. - gsCgA.x * 1.1;
    film = smoothstep(th, th + .3, big * .6 + (1. - smoothstep(0., .5, (p.y - gsCpB.z) / max(gsCpB.y - gsCpB.z, .3))) * .3 + .25) * (1. - wiped * .92) * .85;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.34, .31, .26), film); roughnessFactor = mix(roughnessFactor, .8, film);
  }
  // drops of rain on it
  float gsWet = gsCpWet(gsCgA.y);
  if (gsWet > 0. && lamp < .5) {
    float vis = 1. - smoothstep(.6, 1.3, fpm * 110.), rim;
    if (vis > 0.) {
      float fan = gsCgS.w > 0. && n.z < -.3 ? 1. - .7 * (1. - smoothstep(gsCgS.w - .05, gsCgS.w, min(length(p - vec3(gsCgS.x, gsCgS.y, gsCgS.z)), length(p - vec3(gsCgS.x + .62, gsCgS.y, gsCgS.z))))) : 1.;
      vec2 d = gsCpDrop(p, n, mix(.2, .58, gsWet) * fan, 110., rim) * vis;
      if (dot(d, d) > 0.) { normal = normalize(normal + (d.x * gsCpT + d.y * gsCpB2) * .9); diffuseColor.rgb *= 1. - rim * .5; gsCgAlpha = max(gsCgAlpha, .25 + rim * .4); roughnessFactor = .04; }
    }
  }
  // milky cracks; glass more of a mirror edge on (opacity by the angle); a lamp's broken glass darker
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.78, .8, .8), crack * (1. - lamp * .5)); roughnessFactor = mix(roughnessFactor, .55, crack);
  diffuseColor.rgb *= 1. - gsCgDark * .55;
  float nv = clamp(dot(normal, normalize(vViewPosition)), 0., 1.), fr = pow(1. - nv, 4.);
  gsCgAlpha = clamp(max(gsCgAlpha + (1. - gsCgAlpha) * fr * .85, max(crack * .9, film)), 0., 1.);
}`;
