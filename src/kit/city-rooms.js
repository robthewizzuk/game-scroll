// Rooms behind every window of gs.city (interior mapping), as one named look ('rooms') on a facade's
// own material: a facade is still a flat wall of quads, but where the facade picture has a window the
// shader follows the eye's ray into it. First the hole in the wall (its sides, head and sill, the
// reveal, darker the deeper they go), then the frame and its bars, then the glass, and past the glass a
// room: back and side walls, floor and ceiling, a piece of furniture standing in it, curtains or blinds,
// each room its own from the building's seed and the window's place. By day the rooms show dimly
// behind the reflections; at night the ones the facade picture lights glow (so a window is lit near and
// far alike), lit from their ceilings. Far away (past `far` metres) the painted picture takes over, faded
// across the last third so nothing pops.
//
// Joost van Dongen's interior mapping (2008), with no cube maps: the room is worked out in the window's
// own cell (its bay across and its storey up, in metres into the building), so it costs a few dozen sums
// a pixel and no texture reads past the one that says whether the window is lit.
// Kit use only: city.js gives each facade material its rooms; city-gpu.js roomsLook is the same as nodes
// (hd3d-gpu.js gpuLooks.rooms).
import { Color, Vector2, Vector4 } from 'three';
import { lookPatch } from './looks.js';

// how dark the rooms are by day (light from the windows: x) and how strongly lit windows glow at night (y): the city sets both
export const ROOMS = { gsRmLight: { value: new Vector2(.11, 0) } };

/**
 * The rooms of a facade kind: win (the window in its cell: x0, y0, x1, y1, 0..1 up from the cell's foot),
 * cells (the facade picture's cells across and up), reveal (metres from the wall's face to the glass), depth
 * (of a room, metres), kind ('punched' | 'curtain' | 'house' | 'shed' | 'shop'), see (how much of the room shows
 * through the glass, 0..1), frame (the frame's width, of a cell), trim (the reveal's and frame's colour), glass
 * (its own colour), metal (the glass's metalness: tinted towers are more mirror), far (metres).
 */
export const KIND = { punched: 0, curtain: 1, house: 2, shed: 3, shop: 4 };
export function rooms(m, { win, cells = [8, 8], reveal = .2, depth = 4.5, kind = 'punched', see = .8, frame = .035, trim = '#cab9a0', glass = '#0a0e12', metal = .05, far = 240 } = {}) {
  const g = new Color(glass), t = new Color(trim);
  const U = {
    gsRmWin: { value: new Vector4(...win) }, gsRmShape: { value: new Vector4(cells[0], cells[1], reveal, depth) },
    gsRmLook: { value: new Vector4(KIND[kind] ?? 0, see, frame, far) }, gsRmTrim: { value: t }, gsRmGlass: { value: new Vector4(g.r, g.g, g.b, metal) },
    gsRmLight: ROOMS.gsRmLight,
  };
  lookPatch(m, 'rooms', {
    uniforms: U,
    vertexHead: 'attribute vec4 gsRoom; varying vec4 vGsRoom;\n',
    vertex: [['#include <begin_vertex>', 'after', '\n  vGsRoom = gsRoom;']],
    fragmentHead: ROOM_GLSL,
    fragment: [
      ['#include <color_fragment>', 'after', ROOM_CALL],
      ['#include <roughnessmap_fragment>', 'after', '\n  if (gsRmK > 0.) roughnessFactor = mix(roughnessFactor, gsRmR, gsRmK);'],
      ['#include <metalnessmap_fragment>', 'after', '\n  if (gsRmK > 0. && gsRmM >= 0.) metalnessFactor = mix(metalnessFactor, gsRmM, gsRmK);'],
      ['#include <emissivemap_fragment>', 'after', '\n  if (gsRmK > 0.) totalEmissiveRadiance = mix(totalEmissiveRadiance, gsRmE, gsRmK);'],
    ],
  });
  return m;
}

// (the same sums as city-gpu.js roomsLook: change both)
const ROOM_GLSL = `uniform vec4 gsRmWin, gsRmShape, gsRmLook, gsRmGlass; uniform vec3 gsRmTrim; uniform vec2 gsRmLight; varying vec4 vGsRoom;
vec3 gsRmC, gsRmE; float gsRmR, gsRmM, gsRmK;
float gsRmT(float o, float d, float lo, float hi) { return d > 1e-5 ? (hi - o) / d : d < -1e-5 ? (lo - o) / d : 1e6; }
float gsRmH(vec2 p) { vec3 a = fract(vec3(p.xyx) * .1031); a += dot(a, a.yzx + 33.33); return fract((a.x + a.y) * a.z); }
vec3 gsRmPick(float k, vec3 a, vec3 b, vec3 c, vec3 d) { return k < .25 ? a : k < .5 ? b : k < .75 ? c : d; }
void gsRooms(vec2 uv0, vec3 V, vec3 N, vec3 Up, float dist, vec3 lamp) {
  gsRmK = 0.; gsRmM = -1.;
  float fade = 1. - smoothstep(gsRmLook.w * .66, gsRmLook.w, dist);
  if (vGsRoom.w < .5 || fade <= 0. || vGsRoom.x <= 0.) return;
  vec2 U = uv0 * gsRmShape.xy, cell = floor(U), c = U - cell, ci = mod(cell, gsRmShape.xy);
  float kind = gsRmLook.x; vec4 W = gsRmWin;
  if (abs(kind - 2.) < .5 && mod(ci.x * 7. + ci.y * 3., 5.) > 2.5) return;   // a house: some bays have no window (as its picture)
  if (abs(kind - 3.) < .5 && abs(mod(ci.x + ci.y, 3.) - 1.) < .5) return;    // a shed's strip windows, likewise
  if (c.x < W.x || c.x > W.z || c.y < W.y || c.y > W.w) return;
  vec3 T = normalize(cross(Up, N));
  // the eye's ray in the cell: across in bays, up in storeys, in (metres) from the wall's face
  vec3 d = vec3(dot(V, T) / vGsRoom.x, dot(V, Up) / vGsRoom.y, max(-dot(V, N), .03));
  float rv = gsRmShape.z, D = gsRmShape.w, tx = gsRmT(c.x, d.x, W.x, W.z), ty = gsRmT(c.y, d.y, W.y, W.w), tG = rv / d.z;
  gsRmK = fade;
  if (min(tx, ty) < tG) {   // the hole's side: the jambs, the head (in its own shade) or the sill (lit from above), darker deeper in
    float sh = tx < ty ? .6 : d.y > 0. ? .4 : .88;
    gsRmC = gsRmTrim * sh * (1. - .35 * min(tx, ty) * d.z / rv); gsRmE = vec3(0.); gsRmR = .85; return;
  }
  vec2 g = c + d.xy * tG;   // where it meets the glass
  float fw = gsRmLook.z, fy = fw * vGsRoom.x / vGsRoom.y;
  bool fr = g.x < W.x + fw || g.x > W.z - fw || g.y < W.y + fy || g.y > W.w - fy;
  if (kind < .5 || abs(kind - 2.) < .5) fr = fr || abs(g.x - (W.x + W.z) * .5) < fw * .45;   // a middle bar
  if (abs(kind - 1.) < .5 || abs(kind - 4.) < .5) fr = fr || abs(g.y - mix(W.y, W.w, .8)) < fy * .45;   // a transom
  if (fr) { gsRmC = gsRmTrim * .92; gsRmE = vec3(0.); gsRmR = .5; return; }
  float r1 = gsRmH(cell + vGsRoom.z * 7.13), r2 = gsRmH(cell.yx * 1.3 + vGsRoom.z * 3.7 + 11.), r3 = gsRmH(cell * 1.7 + vGsRoom.z + 23.), r4 = gsRmH(cell * .7 + vGsRoom.z * 1.9 + 41.);
  float lit = abs(kind - 4.) < .5 ? 1. : step(.004, dot(lamp, vec3(.3, .59, .11)));
  vec3 lc = abs(kind - 4.) < .5 ? vec3(1., .95, .86) : lamp / max(max(lamp.r, max(lamp.g, lamp.b)), 1e-3);
  // the room: x across the bay (0..1), y up the storey (0..1), z metres in from the glass
  float twx = gsRmT(g.x, d.x, 0., 1.), twy = gsRmT(g.y, d.y, 0., 1.), tb = D / d.z, t = min(min(twx, twy), tb);
  vec3 h = vec3(g + d.xy * t, d.z * t);
  bool office = abs(kind - 1.) < .5, shop = abs(kind - 4.) < .5;
  vec3 wall = office ? vec3(.62, .62, .6) : gsRmPick(r1, vec3(.66, .6, .5), vec3(.52, .58, .6), vec3(.68, .66, .6), vec3(.56, .5, .44));
  vec3 col; float pan = 0.;
  if (t == tb) {   // the back wall: a doorway, a picture, or (a shop) shelves of goods
    col = wall;
    if (shop) {   // five shelves, each with its own run of goods of one width, some taller than others
      float row = floor(h.y * 5.), sy = fract(h.y * 5.), n = 4. + floor(gsRmH(vec2(row, r1 * 9.)) * 7.), q = gsRmH(vec2(floor(h.x * n), row) + r1 * 17.);
      col = sy < .1 ? vec3(.3, .26, .22) : sy > .3 + .6 * q || fract(h.x * n) < .07 ? wall * .4 : gsRmPick(fract(q * 7.3), vec3(.7, .3, .2), vec3(.3, .45, .62), vec3(.8, .7, .36), vec3(.4, .55, .34)) * (.45 + .35 * fract(q * 13.1));
    }
    else if (r2 < .35 && abs(h.x - (.2 + .6 * r3)) < .11 && h.y < .72) col *= .35;
    else if (r2 > .6 && abs(h.x - (.25 + .5 * r4)) < .13 && abs(h.y - .55) < .1) col = gsRmPick(r3, vec3(.3, .4, .5), vec3(.6, .4, .3), vec3(.3, .45, .3), vec3(.7, .65, .5)) * .8;
  } else if (twx < twy) col = wall * .84;   // a side wall
  else if (d.y < 0.) {   // the floor: boards, carpet or tiles
    col = office ? vec3(.3, .32, .34) : gsRmPick(r3, vec3(.42, .29, .18), vec3(.36, .33, .3), vec3(.5, .4, .3), vec3(.3, .32, .38));
    if (!office && r3 < .25) col *= .85 + .15 * step(.5, fract(h.x * 7.));
  } else {   // the ceiling: light panels in offices and shops, a lamp in the middle of a home
    col = vec3(.74, .73, .7);
    pan = office || shop ? step(abs(fract(h.z * .42) - .5), .16) * step(abs(fract(h.x * 2.) - .5), .2) : 1. - smoothstep(.04, .1, length(vec2(h.x - .5, h.z / D - .45)));
  }
  // something standing in the room: a sofa, a desk, a cupboard (offices: desks and screens; shops: a counter)
  float zf = D * (.32 + .3 * r3), tf = zf / d.z;
  if (tf < t) {
    vec2 f = g + d.xy * tf; float x0 = .08 + .45 * r4, x1 = x0 + .3 + .25 * r1, top = office ? .23 : shop ? .3 : .2 + .25 * r2;
    if (f.x > x0 && f.x < x1 && f.y < top) { col = office ? vec3(.22, .2, .19) : gsRmPick(r4, vec3(.45, .2, .16), vec3(.2, .26, .36), vec3(.4, .36, .3), vec3(.24, .3, .22)); t = tf; h = vec3(f, zf); pan = 0.; }
    else if (office && f.x > x0 + .08 && f.x < x0 + .22 && f.y > top && f.y < top + .1) { col = vec3(.04); t = tf; h = vec3(f, zf); pan = 0.; }
  }
  // the light in it: daylight through the window, falling off inside; at night its lamp, brightest under the ceiling's middle
  // (a shop keeps its lights on by day)
  float day = gsRmLight.x * (1.15 - .75 * clamp(h.z / D, 0., 1.)), night = lit * (shop ? max(gsRmLight.y, .3) * 1.8 : gsRmLight.y * (office ? 1.1 : 1.2)) * (.55 + .45 * (1. - abs(h.x - .5) * 2.)) * (.65 + .35 * h.y);
  vec3 room = col * (vec3(day) + lc * night) + lc * night * pan * 1.5;
  // curtains part drawn from each side, or blinds down from the top, on the glass itself (lit through at night)
  float gw = (g.x - W.x) / (W.z - W.x), gh = (g.y - W.y) / (W.w - W.y), cur = !shop && r4 < .3 ? .12 + .18 * r2 : 0., bl = !shop && r4 > .74 ? r3 * .7 : 0.;
  if (gw < cur || gw > 1. - cur) { vec3 cc = gsRmPick(r2, vec3(.62, .55, .44), vec3(.5, .2, .18), vec3(.35, .42, .55), vec3(.8, .78, .72)) * (.82 + .18 * sin(gw * 70.)); room = cc * (gsRmLight.x * .9 + lc * night * .55); }
  else if (gh > 1. - bl) { vec3 bc = vec3(.82, .8, .74) * (.86 + .14 * step(.5, fract(gh * 16.))); room = bc * (gsRmLight.x * .9 + lc * night * .5); }
  gsRmC = gsRmGlass.rgb; gsRmE = room * gsRmLook.y; gsRmR = .05 + .12 * r3 * r3; gsRmM = gsRmGlass.a;
}
`;
const ROOM_CALL = `
  {
    vec3 gsLamp = vec3(0.);
  #ifdef USE_EMISSIVEMAP
    { vec2 gsU = vMapUv * gsRmShape.xy; gsLamp = textureLod(emissiveMap, (floor(gsU) + vec2((gsRmWin.x + gsRmWin.z) * .5, (gsRmWin.y + gsRmWin.w) * .5)) / gsRmShape.xy, 0.).rgb; }
  #endif
    gsRooms(vMapUv, normalize(-vViewPosition), normalize(vNormal), normalize(viewMatrix[1].xyz), length(vViewPosition), gsLamp);
    if (gsRmK > 0.) diffuseColor.rgb = mix(diffuseColor.rgb, gsRmC, gsRmK);
  }`;
