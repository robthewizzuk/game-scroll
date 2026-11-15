// gs.city Interiors: the rooms behind the city's front doors. Every building in a City (and in each district of a
// Metro) has its own door in its street wall (city-doors.js); walk up to one and the room behind it is made, a few
// pieces a frame, as a gs.regions part: a corner shop with its aisles and counter, a diner, a bar, a front room, an
// office lobby with its lifts, a warehouse of racks. Once it is made the door swings open as the player comes to it
// and they walk straight in, with no loading and no cut: the street shows through the door and the windows, and the
// room shows from the street. Rooms well behind the player are let go of (their meshes, pictures and bodies).
//
//   const inside = new Interiors(city, { world });        // in make(): its materials are made under the loading screen
//   inside.update(dt, player.position);                   // each frame, after city.update()
//   inside.room              // the room the player is in, or null: { kind, building, spots, lamps, x0, z0, x1, z1, y, top... }
//   inside.entered / left    // true on the frame the player came in / went out
//   inside.near(p, 6)        // the nearest front door: { building, door, room (once made), ready }
//   room.spots.keeper        // where the one who works there stands, and which way they face: { x, y, z, turn }
//   room.spots.counter / seats / stand / door / exit
//
// A room is solid both ways the game's world is: city.collide() keeps a walker inside it (its walls and furniture
// stand for the ground storey while they are in it or in its doorway), and with a World3D its walls and furniture are
// bodies, and the door stops being solid while it is open (city.solid). Its ceiling lamps light it by day and by
// night through the city's lamps. The plan of a room is plain numbers (roomPlan), the same every time for a building.
// Kit file: games reach it as gs.city.Interiors.
import { Group, Mesh, MeshStandardMaterial, Color } from 'three';
import { Quads, FACADES, KERB } from './city.js';
import { DOOR_DEEP } from './city-doors.js';
import { Regions } from './regions.js';
import { material } from './models/materials.js';
import { rng } from './math.js';
import { linksFor, linked } from './links.js';

/** The kinds of room, and how big each can be across (along the street) and deep: metres. */
export const INSIDE_KINDS = { store: [12, 10], diner: [13, 10], bar: [12, 11], home: [8.5, 7], lobby: [12, 9], warehouse: [18, 14] };

/** The kind of room behind building b's door when none is chosen: shops are a store, a diner or a bar, houses homes, sheds warehouses, the rest lobbies. */
export function roomKind(b) {
  const F = FACADES[b.facade];
  if (F.kind === 'house') return 'home';
  if (F.kind === 'shed') return 'warehouse';
  if (b.shops) { const k = (Math.imul(b.id + 7, 2654435761) >>> 0) % 20; return k < 9 ? 'store' : k < 15 ? 'diner' : 'bar'; }
  return 'lobby';
}

// a room's own frame: t along the street wall from its first corner (as doorwayOf), v in from the wall's face
const frame = h => ({ x: (t, v) => h.ax + h.tx * t - h.nx * v, z: (t, v) => h.az + h.tz * t - h.nz * v });

/**
 * The plan of the room behind building b's door, in plain numbers (no view): { kind, x0, z0, x1, z1 (its floor, world),
 * y (the floor), top (the ceiling), area (where it stands for the building in city.collide: the floor and its doorway),
 * boxes (what is solid in it: walls and furniture, { x0, z0, x1, z1, y0, y1 }), doorBox (the shut door), pieces
 * (what is drawn: { m: material name, box: [x0, y0, z0, x1, y1, z1], col }, or { m, prism: [x, z, r, y0, y1, sides] }),
 * holes (in its street wall: the door and windows onto the street), lamps, spots }. kind: one of INSIDE_KINDS, or roomKind(b).
 */
export function roomPlan(b, { kind = null, seed = 0 } = {}) {
  const h = b.doorway; if (!h) return null;
  kind ||= roomKind(b);
  const F = FACADES[b.facade], p = b.parts[0], R = rng(b.id * 7349 + seed * 31 + 11), [WM, DM] = INSIDE_KINDS[kind] || INSIDE_KINDS.store;
  const L = h.s % 2 === 0 ? p.x1 - p.x0 : p.z1 - p.z0, deep = h.s % 2 === 0 ? p.z1 - p.z0 : p.x1 - p.x0, tm = (h.t0 + h.t1) / 2;
  const W = Math.max(h.w + 1.6, Math.min(L - .6, WM)), ta = Math.max(.3, Math.min(L - .3 - W, tm - W / 2)), tb = ta + W;
  const v0 = DOOR_DEEP, v1 = v0 + Math.max(3, Math.min(DM, deep - DOOR_DEEP - .3)), y = KERB, top = KERB + h.storey - .2;
  const at = frame(h), wx = (t, v) => at.x(t, v), wz = (t, v) => at.z(t, v);
  // a box in the room's frame, as a world box (the city's walls run along x and z, so these do too)
  const wbox = (t0, va, ya, t1, vb, yb) => { const xa = wx(t0, va), xb = wx(t1, vb), za = wz(t0, va), zb = wz(t1, vb); return [Math.min(xa, xb), ya, Math.min(za, zb), Math.max(xa, xb), yb, Math.max(za, zb)]; };
  const plan = { kind, building: b.id, y, top, ta, tb, v0, v1, pieces: [], boxes: [], holes: [], lamps: [], spots: { seats: [], stand: [] } };
  const draw = (m, t0, va, ya, t1, vb, yb, col) => plan.pieces.push({ m, box: wbox(t0, va, ya, t1, vb, yb), col: col || null });
  const solid = (t0, va, t1, vb, ya, yb) => { const [x0, y0, z0, x1, y1, z1] = wbox(t0, va, ya, t1, vb, yb); plan.boxes.push({ x0, z0, x1, z1, y0, y1 }); };
  const round = (m, t, v, r, ya, yb, col, sides = 8) => plan.pieces.push({ m, prism: [wx(t, v), wz(t, v), r, ya, yb, sides], col: col || null });
  // which way a thing faces, from a way in the room's frame (dt, dv): a heading, Math.atan2(dx, dz)
  const turnOf = (dt, dv) => Math.atan2(h.tx * dt - h.nx * dv, h.tz * dt - h.nz * dv);
  const spot = (t, v, dt = 0, dv = 1) => ({ x: wx(t, v), y, z: wz(t, v), turn: turnOf(dt, dv) });
  // what is taken: furniture footprints (for placing more), kept clear: the way in from the door
  const taken = [], keepClear = [[h.t0 - .7, v0, h.t1 + .7, v0 + 2.2]];
  const fits = (t0, va, t1, vb, gap = .05) => t0 >= ta - 1e-6 && t1 <= tb + 1e-6 && va >= v0 - 1e-6 && vb <= v1 + 1e-6
    && !taken.some(q => t0 < q[2] + gap && t1 > q[0] - gap && va < q[3] + gap && vb > q[1] - gap)
    && !keepClear.some(q => t0 < q[2] && t1 > q[0] && va < q[3] && vb > q[1]);
  const take = (t0, va, t1, vb, ya = y, yb = y + 1, isSolid = true) => { taken.push([t0, va, t1, vb]); if (isSolid) solid(t0, va, t1, vb, ya, yb); };

  /* the room itself: walls (the street wall with the door and windows), floor, ceiling and its lights */
  const SURF = {
    store: { floor: 'tiles', wall: '#e9e4d6', trim: '#3a6a5a' }, diner: { floor: 'tiles', wall: '#efe0c4', trim: '#a83228' },
    bar: { floor: 'planks', wall: '#6a3a2a', trim: '#2a1a14', brick: true }, home: { floor: 'planks', wall: R.pick(['#e8dccb', '#d6e0d8', '#e6d4d0', '#dcd8e8']), trim: '#f4f0e8' },
    lobby: { floor: 'marble', wall: F.kind === 'curtain' ? '#d8d6d0' : '#e4dccb', trim: '#4a4a4c' }, warehouse: { floor: 'concrete', wall: '#9a948a', trim: '#5a5650', brick: true },
  }[kind];
  plan.surf = SURF;
  // windows onto the street, where the facade's ground-storey windows are (its picture: city.js INSIDE_KINDS), and the door
  plan.holes.push({ t0: h.t0, t1: h.t1, y0: y, y1: y + h.h, door: true });
  if (b.shops) {
    const n = Math.max(1, Math.round(L / 5)), bw = L / n;
    for (let i = 0; i < n; i++) { const a = i * bw + .4, c = (i + 1) * bw - .4; if (c > ta + .2 && a < tb - .2 && (c < h.t0 - .3 || a > h.t1 + .3)) plan.holes.push({ t0: Math.max(a, ta + .2), t1: Math.min(c, tb - .2), y0: y + .55, y1: KERB + 4.6 - 1.2 }); }
  } else if (F.kind !== 'shed') {
    const win = { punched: [.24, .22, .76, .8], curtain: [.04, .22, .96, .96], house: [.3, .25, .7, .75] }[F.kind], n = Math.max(1, Math.round(L / F.win)), bw = L / n;
    for (let i = 0; i < n; i++) { const a = (i + win[0]) * bw, c = (i + win[2]) * bw; if (c > ta + .2 && a < tb - .2 && (c < h.t0 - .15 || a > h.t1 + .15)) plan.holes.push({ t0: Math.max(a, ta + .2), t1: Math.min(c, tb - .2), y0: KERB + win[1] * F.floor, y1: Math.min(top - .1, KERB + win[3] * F.floor) }); }
  }
  // its walls as solid boxes: the street wall either side of the door (as thick as the building's), the sides and the back
  solid(ta - .2, 0, h.t0, v0, y, top); solid(h.t1, 0, tb + .2, v0, y, top);
  solid(ta - .2, 0, ta, v1 + .2, y, top); solid(tb, 0, tb + .2, v1 + .2, y, top); solid(ta - .2, v1, tb + .2, v1 + .2, y, top);
  const db = wbox(h.t0, 0, y, h.t1, v0, y + h.h); plan.doorBox = { x0: db[0], z0: db[2], x1: db[3], z1: db[5], y0: y, y1: y + h.h };
  const ar = wbox(ta, -.7, y, tb, v1, top); plan.area = { x0: ar[0], z0: ar[2], x1: ar[3], z1: ar[5] };
  const fl = wbox(ta, v0, y, tb, v1, top); Object.assign(plan, { x0: fl[0], z0: fl[2], x1: fl[3], z1: fl[5] });
  // the ceiling lights: one to about every 22 square metres, in a grid
  const area = (tb - ta) * (v1 - v0), nL = Math.max(1, Math.min(4, Math.round(area / 22))), cols = nL >= 2 ? 2 : 1, rows = Math.ceil(nL / cols);
  const warm = { store: '#f4f4ff', diner: '#fff0d8', bar: '#ffc890', home: '#ffe2b8', lobby: '#fff6ea', warehouse: '#eef4ff' }[kind];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows && plan.lamps.length < nL; j++) {
    const t = ta + (i + .5) * (tb - ta) / cols, v = v0 + (j + .5) * (v1 - v0) / rows;
    plan.lamps.push({ x: wx(t, v), y: top - .25, z: wz(t, v), col: warm, i: kind === 'bar' ? .6 : .9, reach: Math.max(7, Math.min(12, Math.sqrt(area) * 1.3)) });
    draw('glow', t - .45, v - .45, top - .04, t + .45, v + .45, top - .01);
  }
  plan.spots.door = spot(tm, v0 + .9, 0, 1);
  plan.spots.exit = spot(tm, -1.4, 0, -1);

  /* the furniture, by kind */
  const counter = (t0, va, t1, vb, faceT, faceV, hgt = .95, top0 = 'stone') => {   // a counter: a wooden body and a top that overhangs on the customer's side
    take(t0, va, t1, vb, y, y + hgt);
    draw('wood', t0, va, y, t1, vb, y + hgt - .05, SURF.trim);
    draw(top0, t0 - (faceT < 0 ? .06 : 0), va - (faceV < 0 ? .06 : 0), y + hgt - .05, t1 + (faceT > 0 ? .06 : 0), vb + (faceV > 0 ? .06 : 0), y + hgt);
  };
  const shelves = (t0, va, t1, vb, hgt, both = false) => {   // a shelf unit with things on it (both sides when it stands out in the room)
    take(t0, va, t1, vb, y, y + hgt);
    const alongT = t1 - t0 >= vb - va, n = 4;
    draw('wood', t0, va, y, t1, vb, y + .08, '#3a3530');
    for (let k = 1; k <= n; k++) { const yy = y + hgt * k / n; draw('wood', t0, va, yy - .03, t1, vb, yy, '#8a7a68'); }
    // the back (or the spine down the middle) and the ends
    if (alongT) { const m = (va + vb) / 2; draw('wood', t0, m - .02, y, t1, m + .02, y + hgt, '#6a5a48'); draw('wood', t0, va, y, t0 + .03, vb, y + hgt, '#6a5a48'); draw('wood', t1 - .03, va, y, t1, vb, y + hgt, '#6a5a48'); }
    else { const m = (t0 + t1) / 2; draw('wood', m - .02, va, y, m + .02, vb, y + hgt, '#6a5a48'); draw('wood', t0, va, y, t1, va + .03, y + hgt, '#6a5a48'); draw('wood', t0, vb - .03, y, t1, vb, y + hgt, '#6a5a48'); }
    const goods = ['#d8442e', '#2f8fd8', '#f2c230', '#46b26a', '#e86ab8', '#f2f2f2', '#9a62e0', '#f08a2a', '#7a4a2a', '#2a4a6a'];
    for (let k = 0; k < n; k++) {
      const yy = y + hgt * k / n + (k === 0 ? .08 : 0), gh = Math.min(.32, hgt / n - .08);
      const len = alongT ? t1 - t0 : vb - va;
      for (let s = .05; s < len - .1;) {
        const w = .12 + R() * .22, col = R.pick(goods), gap = R() < .12 ? .25 : .02;
        if (s + w > len - .05) break;
        const ht = gh * (.55 + R() * .45);
        for (const side of both ? [0, 1] : [alongT ? 0 : 0]) {
          if (alongT) { const a = side ? (va + vb) / 2 + .03 : va + .04, c = side ? vb - .04 : (both ? (va + vb) / 2 - .03 : vb - .06); draw('plain', t0 + s, a, yy, t0 + s + w, c, yy + ht, col); }
          else { const a = side ? (t0 + t1) / 2 + .03 : t0 + .04, c = side ? t1 - .04 : (both ? (t0 + t1) / 2 - .03 : t1 - .06); draw('plain', a, va + s, yy, c, va + s + w, yy + ht, col); }
        }
        s += w + gap;
      }
    }
  };
  const table = (t, v, w, d, hgt = .75, m = 'wood', col = null) => { draw(m, t - w / 2, v - d / 2, y + hgt - .04, t + w / 2, v + d / 2, y + hgt, col); draw('metal', t - .05, v - .05, y, t + .05, v + .05, y + hgt - .04); draw('metal', t - .25, v - .25, y, t + .25, v + .25, y + .03); };
  const chair = (t, v, ft, fv, col = '#6a4a2e') => {   // a chair at t, v whose sitter faces (ft, fv)
    draw('wood', t - .21, v - .21, y + .43, t + .21, v + .21, y + .47, col);
    for (const [a, c] of [[-.18, -.18], [.15, -.18], [-.18, .15], [.15, .15]]) draw('wood', t + a, v + c, y, t + a + .035, v + c + .035, y + .43, col);
    const bt = t - ft * .2, bv = v - fv * .2;   // (its back, behind the sitter)
    if (ft) draw('wood', bt - .02, v - .21, y + .47, bt + .02, v + .21, y + .95, col); else draw('wood', t - .21, bv - .02, y + .47, t + .21, bv + .02, y + .95, col);
    plan.spots.seats.push({ ...spot(t, v, ft, fv), y: y + .47 });
  };
  const stool = (t, v, ft, fv) => { round('metal', t, v, .03, y, y + .72, null, 6); round('fabric', t, v, .19, y + .72, y + .78, '#8a2a24'); plan.spots.seats.push({ ...spot(t, v, ft, fv), y: y + .78 }); };
  const tablesIn = (t0, va, t1, vb, seats = 2) => {   // tables with chairs in a grid over a free stretch of floor
    const cw = seats === 4 ? 2.1 : 1.7, cd = seats === 4 ? 2.1 : 1.9;
    for (let t = t0 + cw / 2; t + cw / 2 <= t1 + 1e-6; t += cw) for (let v = va + cd / 2; v + cd / 2 <= vb + 1e-6; v += cd) {
      const tw = seats === 4 ? .9 : .7;
      if (!fits(t - tw / 2 - .5, v - tw / 2 - .5, t + tw / 2 + .5, v + tw / 2 + .5, .1)) continue;
      take(t - tw / 2, v - tw / 2, t + tw / 2, v + tw / 2, y, y + .75); table(t, v, tw, tw);
      take(t - tw / 2 - .5, v - tw / 2 - .5, t + tw / 2 + .5, v + tw / 2 + .5, y, y, false);
      chair(t, v - tw / 2 - .25, 0, 1); chair(t, v + tw / 2 + .25, 0, -1);
      if (seats === 4) { chair(t - tw / 2 - .25, v, 1, 0); chair(t + tw / 2 + .25, v, -1, 0); }
    }
  };
  const W2 = tb - ta, D2 = v1 - v0, left = h.t0 - ta > tb - h.t1;   // (the wider side of the door)
  const sideRoom = (left ? h.t0 - ta : tb - h.t1) >= 3.2;   // (room for a counter beside the door, and a way past it)
  if (kind === 'store' && !sideRoom) plan.kind = kind = 'diner';
  if (kind === 'store') {
    // the counter by the door on the wider side, the one who works there behind it, aisles of shelves beyond, shelves round the walls
    const side = left ? ta : tb, sg = left ? 1 : -1, ct = side + sg * 1.1, cl = Math.min(3, D2 * .4);
    const c0 = Math.min(ct, ct + sg * .6), c1 = Math.max(ct, ct + sg * .6);
    counter(c0, v0 + .8, c1, v0 + .8 + cl, sg, 0);
    draw('plain', c0 + .1, v0 + 1.1, y + .95, c1 - .1, v0 + 1.5, y + 1.2, '#2a2c30');   // the till
    plan.spots.keeper = spot(side + sg * .55, v0 + .8 + cl / 2, sg, 0); plan.spots.counter = spot(ct + sg * 1.05, v0 + .8 + cl / 2, -sg, 0);
    take(Math.min(side, ct), v0, Math.max(side, ct), v0 + .8 + cl + .1, y, y, false);   // (behind the counter: kept clear)
    keepClear.push([Math.min(ct + sg * .6, ct + sg * 1.6), v0, Math.max(ct + sg * .6, ct + sg * 1.6), v1 - .5]);   // (in front of it, the way down the shop)
    shelves(ta + .05, v1 - .5, tb - .05, v1 - .05, 2);   // along the back wall
    const s0 = left ? c1 + 1.7 : ta + .5, s1 = left ? tb - .5 : c0 - 1.7;
    for (let t = s0; t + .9 <= s1 + 1e-6; t += 2.25) if (fits(t, v0 + 2.6, t + .9, v1 - 1.5)) shelves(t, v0 + 2.6, t + .9, v1 - 1.5, 1.6, true);
    const ws = left ? tb - .5 : ta + .05;   // shelves on the wall opposite the counter
    if (fits(ws, v0 + 1, ws + .45, v1 - .6)) shelves(ws, v0 + 1, ws + .45, v1 - .6, 2);
  } else if (kind === 'diner' || kind === 'bar') {
    if (kind === 'diner' || D2 < W2 || !sideRoom) {
      // a counter along the back with stools in front, a way round one end, tables down the room
      const gapAtLeft = R() < .5, c0 = ta + (gapAtLeft ? 1.1 : .05), c1 = tb - (gapAtLeft ? .05 : 1.1), cv = v1 - 1.85;
      counter(c0, cv, c1, cv + .6, 0, -1, kind === 'bar' ? 1.05 : .95, kind === 'bar' ? 'wood' : 'stone');
      take(ta, cv + .6, tb, v1, y, y, false);
      shelves(ta + .3, v1 - .45, tb - .3, v1 - .05, 1.8);   // the back bar
      plan.spots.keeper = spot((c0 + c1) / 2, v1 - .85, 0, -1); plan.spots.counter = spot((c0 + c1) / 2, cv - .55, 0, 1);
      for (let t = c0 + .45; t <= c1 - .45; t += .85) stool(t, cv - .4, 0, 1);
      take(c0, cv - .75, c1, cv, y, y, false);
      keepClear.push([h.t0 - .4, v0, h.t1 + .4, cv - .75]);   // (the way from the door to the counter)
      tablesIn(ta + .1, v0 + 1.2, h.t0 - .4, cv - .9, kind === 'bar' ? 4 : 2); tablesIn(h.t1 + .4, v0 + 1.2, tb - .1, cv - .9, kind === 'bar' ? 4 : 2);
    } else {
      // a long bar down one side wall, the bottles behind it, tables across the rest
      const side = left ? ta : tb, sg = left ? 1 : -1, ct = side + sg * 1.25, c0 = Math.min(ct, ct + sg * .6), c1 = Math.max(ct, ct + sg * .6);
      counter(c0, v0 + 1.4, c1, v1 - 1.1, sg, 0, 1.05, 'wood');
      shelves(Math.min(side, side + sg * .45), v0 + 1.4, Math.max(side, side + sg * .45), v1 - .3, 1.8);
      take(Math.min(side, ct), v0 + 1.4, Math.max(side, ct), v1, y, y, false);
      plan.spots.keeper = spot(side + sg * .85, (v0 + v1) / 2, sg, 0); plan.spots.counter = spot(ct + sg * 1.15, (v0 + v1) / 2, -sg, 0);
      for (let v = v0 + 1.8; v <= v1 - 1.5; v += .85) stool(ct + sg * .95, v, -sg, 0);
      const r0 = left ? c1 + 1.5 : ta + .1, r1 = left ? tb - .1 : c0 - 1.5;
      take(Math.min(ct + sg * .6, ct + sg * 1.4), v0 + 1.4, Math.max(ct + sg * .6, ct + sg * 1.4), v1 - 1.1, y, y, false);
      tablesIn(r0, v0 + 2.3, r1, v1 - .2, 4);
    }
  } else if (kind === 'home') {
    // a sofa facing the television across a rug, a table with chairs, a bookcase, and a door on through to the rest of the house
    const rugT = ta + W2 * (left ? .3 : .7), rugV = v0 + D2 * .55;
    draw('fabric', rugT - 1.3, rugV - .9, y + .02, rugT + 1.3, rugV + .9, y + .03, R.pick(['#8a3a3a', '#3a5a7a', '#6a6a3a', '#7a5a8a']));
    const st = rugT, sv = Math.min(v1 - .55, rugV + 1.25), sw = 1.9;   // the sofa against the back, facing the room
    const sofa = R.pick(['#5a6a7a', '#7a4a3a', '#4a6a4a', '#8a7a6a']);
    if (fits(st - sw / 2, sv - .45, st + sw / 2, sv + .45)) {
      take(st - sw / 2, sv - .45, st + sw / 2, sv + .45, y, y + .85);
      draw('fabric', st - sw / 2, sv - .45, y + .1, st + sw / 2, sv + .45, y + .45, sofa); draw('fabric', st - sw / 2, sv + .2, y + .45, st + sw / 2, sv + .45, y + .88, sofa);
      draw('fabric', st - sw / 2, sv - .45, y + .45, st - sw / 2 + .2, sv + .45, y + .65, sofa); draw('fabric', st + sw / 2 - .2, sv - .45, y + .45, st + sw / 2, sv + .45, y + .65, sofa);
      plan.spots.seats.push({ ...spot(st - .45, sv - .1, 0, -1), y: y + .45 }, { ...spot(st + .45, sv - .1, 0, -1), y: y + .45 });
    }
    if (fits(st - .5, rugV - .48, st + .5, rugV + .08, .4)) { table(st, rugV - .2, 1, .55, .42); take(st - .5, rugV - .48, st + .5, rugV + .08, y, y + .42); }
    const tvV = Math.max(v0 + 1.4, rugV - 1.6);
    if (fits(st - .8, tvV - .25, st + .8, tvV + .25)) { take(st - .8, tvV - .25, st + .8, tvV + .25, y, y + .5); draw('wood', st - .8, tvV - .25, y, st + .8, tvV + .25, y + .5, '#4a3a2a'); draw('plain', st - .6, tvV - .05, y + .5, st + .6, tvV + .03, y + 1.2, '#101214'); }
    plan.spots.keeper = spot(st, sv - .1, 0, -1);
    const dt = ta + W2 * (left ? .78 : .22), dv = v0 + D2 * .5;
    if (fits(dt - 1.1, dv - .9, dt + 1.1, dv + .9)) { take(dt - .5, dv - .45, dt + .5, dv + .45, y, y + .75); table(dt, dv, 1, .9); chair(dt, dv - .7, 0, 1, '#5a3a24'); chair(dt, dv + .7, 0, -1, '#5a3a24'); chair(dt - .75, dv, 1, 0, '#5a3a24'); chair(dt + .75, dv, -1, 0, '#5a3a24'); take(dt - 1.1, dv - .95, dt + 1.1, dv + .95, y, y, false); }
    plan.spots.counter = spot(dt, dv - 1.4, 0, 1);
    if (fits(ta + .05, v1 - .4, ta + 1.3, v1 - .05)) shelves(ta + .05, v1 - .4, ta + 1.3, v1 - .05, 1.9);
    const it = tb - 1.4;   // the door on through: shut, on the back wall
    draw('wood', it - .5, v1 - .04, y, it + .5, v1, y + 2.05, '#f2ece2'); draw('metal', it + .32, v1 - .1, y + .95, it + .38, v1 - .04, y + 1.05);
  } else if (kind === 'lobby') {
    // a reception desk facing the door, lifts on the back wall, benches and plants
    const dv = v0 + Math.max(2.4, Math.min(D2 * .55, 4.2)), dw = Math.min(3, W2 - 3);
    if (dw >= 1.2 && dv + 1.9 <= v1 && fits(tm - dw / 2, dv, tm + dw / 2, dv + .7)) {
      counter(tm - dw / 2, dv, tm + dw / 2, dv + .7, 0, -1, 1.1, 'stone');
      plan.spots.keeper = spot(tm, dv + 1.15, 0, -1); plan.spots.counter = spot(tm, dv - .55, 0, 1);
      take(tm - dw / 2, dv + .7, tm + dw / 2, dv + 1.6, y, y, false);
    }
    for (const k of [-1, 1]) {   // the lifts: steel doors in a frame, a lamp over each
      const lt = tm + k * Math.min(1.6, W2 / 4);
      draw('metal', lt - .65, v1 - .05, y, lt + .65, v1, y + 2.35, '#5a5c60'); draw('metal', lt - .55, v1 - .07, y, lt - .01, v1 - .05, y + 2.2, '#a8acb0'); draw('metal', lt + .01, v1 - .07, y, lt + .55, v1 - .05, y + 2.2, '#a8acb0');
      draw('glow', lt - .1, v1 - .08, y + 2.45, lt + .1, v1 - .05, y + 2.55);
    }
    plan.spots.stand.push(spot(tm, v1 - 1, 0, 1));
    for (const [t, sg] of [[ta + .35, 1], [tb - .35, -1]]) {   // plants in the front corners and benches down the sides
      if (fits(t - .3, v0 + .2, t + .3, v0 + .8)) { take(t - .3, v0 + .2, t + .3, v0 + .8, y, y + .6); draw('stone', t - .3, v0 + .2, y, t + .3, v0 + .8, y + .6, '#3a3a3c'); round('plain', t, v0 + .5, .38, y + .6, y + 1.4, '#3a6a32', 7); }
      const bt = t + sg * .2;
      if (fits(Math.min(bt, bt + sg * .5), v0 + 1.5, Math.max(bt, bt + sg * .5), v0 + 3.3)) { take(Math.min(bt, bt + sg * .5), v0 + 1.5, Math.max(bt, bt + sg * .5), v0 + 3.3, y, y + .45); draw('wood', Math.min(bt, bt + sg * .5), v0 + 1.5, y + .38, Math.max(bt, bt + sg * .5), v0 + 3.3, y + .45, '#8a6a4a'); draw('metal', Math.min(bt, bt + sg * .5) + .05, v0 + 1.6, y, Math.max(bt, bt + sg * .5) - .05, v0 + 3.2, y + .38, '#2a2c2e'); plan.spots.seats.push({ ...spot(bt + sg * .25, v0 + 2.4, sg, 0), y: y + .45 }); }
    }
    if (F.kind === 'punched') { const mt = left ? ta + .02 : tb - .32; draw('metal', mt, v0 + 3.6, y + 1, mt + .3, Math.min(v1 - .5, v0 + 5.2), y + 1.9, '#8a7a5a'); }   // (the post boxes of the flats upstairs)
  } else if (kind === 'warehouse') {
    // racks of crates down both sides and in rows, pallets and barrels on the floor, a desk by the door
    const rack = (t0, va, t1, vb) => {
      if (!fits(t0, va, t1, vb)) return; take(t0, va, t1, vb, y, y + 3.6);
      for (const [a, c] of [[t0, va], [t1 - .08, va], [t0, vb - .08], [t1 - .08, vb - .08]]) draw('metal', a, c, y, a + .08, c + .08, y + 3.6, '#d06a1a');
      for (const yy of [y + .15, y + 1.3, y + 2.45]) {
        draw('metal', t0, va, yy, t1, vb, yy + .08, '#2a4a8a');
        for (let s = t0 + .1; s + .9 < t1; s += 1.05) if (R() < .8) { const hh = .5 + R() * .45; draw('planks', s, va + .1, yy + .08, s + .9, vb - .1, yy + .08 + hh, '#c8a070'); }
      }
    };
    const rv0 = v0 + 1, rv1 = v1 - .5;
    for (let v = rv0; v + 1.1 <= rv1; v += 1.15) { rack(ta + .1, v, ta + 1.1, v + 1.1); rack(tb - 1.1, v, tb - .1, v + 1.1); }
    for (let t = ta + 3.4; t + 1.1 <= tb - 3.4; t += 3.6) rack(t, v0 + 3, t + 1.1, v1 - 1.5);
    for (let k = 0; k < 6; k++) {   // crates on pallets and barrels on the open floor
      const t = ta + 2 + R() * (W2 - 4), v = v0 + 2.4 + R() * (D2 - 3.4);
      if (!fits(t - .65, v - .65, t + .65, v + .65, .4)) continue;
      take(t - .55, v - .55, t + .55, v + .55, y, y + 1.4);
      if (R() < .6) { draw('wood', t - .55, v - .55, y, t + .55, v + .55, y + .14, '#a88858'); const n = 1 + (R() * 2 | 0); for (let j = 0; j < n; j++) draw('planks', t - .5, v - .5, y + .14 + j * .62, t + .5, v + .5, y + .14 + (j + 1) * .62 - .02, '#b89060'); }
      else for (const [a, c] of [[-.28, -.28], [.28, -.28], [-.28, .28], [.28, .28]]) round('metal', t + a, v + c, .27, y, y + .9, R.pick(['#2d5a8a', '#8a2a24', '#3a6a3a']), 10);
    }
    const dt = left ? h.t0 - 1.6 : h.t1 + 1.6;
    if (fits(dt - .7, v0 + .3, dt + .7, v0 + 1)) { take(dt - .7, v0 + .3, dt + .7, v0 + 1, y, y + .78); table(dt, v0 + .65, 1.4, .7, .78); chair(dt, v0 + 1.35, 0, -1, '#2a2c2e'); }
    plan.spots.keeper = spot(dt, v0 + 1.35, 0, -1); plan.spots.counter = spot(dt, v0 + 2.2, 0, -1);
  }
  plan.spots.keeper ||= spot(tm, v0 + D2 * .7, 0, -1); plan.spots.counter ||= spot(tm, v0 + D2 * .4, 0, 1);
  // (a customer's spot on clear floor: the nearest that is, if a rack or a table took it)
  const S = plan.spots.counter;
  if (!roomFree(plan, S.x, S.z, .3)) for (let rr = .2, done = false; rr <= 1.6 && !done; rr += .2) for (let k = 0; k < 12 && !done; k++) { const x = S.x + Math.cos(k * Math.PI / 6) * rr, z = S.z + Math.sin(k * Math.PI / 6) * rr; if (roomFree(plan, x, z, .3)) { S.x = x; S.z = z; done = true; } }
  // places to stand: free floor, a little way from everything
  for (let k = 0; k < 40 && plan.spots.stand.length < 6; k++) {
    const t = ta + .6 + R() * (W2 - 1.2), v = v0 + 1.2 + R() * (D2 - 1.8);
    if (fits(t - .45, v - .45, t + .45, v + .45, .1) && !plan.spots.stand.some(s => Math.hypot(s.x - wx(t, v), s.z - wz(t, v)) < 1.4)) plan.spots.stand.push(spot(t, v, R() - .5, R() - .5));
  }
  return plan;
}

/** Whether x, z is clear of everything solid in a room's plan, for something of radius r (and on its floor). */
export function roomFree(plan, x, z, r = .3) {
  if (x < plan.x0 + r || x > plan.x1 - r || z < plan.z0 + r || z > plan.z1 - r) return false;
  for (const b of plan.boxes) if (b.y1 > plan.y + .3 && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return false;
  return true;
}

/* ---------- drawing a room ---------- */

const UVM = { tiles: 1.2, planks: 2, marble: 2.5, concrete: 3, wood: 1, stone: 1.5, metal: 1, fabric: .8, paint: 2.5, brick: 2.4 };
// a quad from four corners, turned to face n (its corners in order round it), its uvs in metres along u and v
function face(q, a, b, c, d, n, s, col = null) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, lu = Math.hypot(ux, uy, uz) / s, lv = Math.hypot(vx, vy, vz) / s;
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) q.quad(a, b, c, d, [0, 0, lu, 0, lu, lv, 0, lv], col);
  else q.quad(a, d, c, b, [0, 0, lv, 0, lv, lu, 0, lu], col);
}

// the room's shell: floor, ceiling, the walls' inner faces (the street wall cut round its door and windows, with their reveals)
function shell(plan, h, Q) {
  const { ta, tb, v0, v1, y, top } = plan, at = frame(h), P = (t, v, yy) => [at.x(t, v), yy, at.z(t, v)];
  const inN = [-h.nx, 0, -h.nz], outN = [h.nx, 0, h.nz], tN = [h.tx, 0, h.tz], mtN = [-h.tx, 0, -h.tz];
  const floor = Q(plan.surf.floor, null, UVM[plan.surf.floor]), wall = Q(plan.surf.brick ? 'brick' : 'paint', plan.surf.brick ? plan.surf.wall : plan.surf.wall, plan.surf.brick ? UVM.brick : UVM.paint), ceil = Q('paint', '#f2f0ea', UVM.paint), trim = Q('wood', plan.surf.trim, 1);
  const fy = y + .015;   // (just over the pavement the city lays under the whole block)
  face(floor.q, P(ta, v0 - DOOR_DEEP + .02, fy), P(tb, v0 - DOOR_DEEP + .02, fy), P(tb, v1, fy), P(ta, v1, fy), [0, 1, 0], floor.s, floor.c);   // (on out under the doorway to the step)
  face(ceil.q, P(ta, v0, top), P(tb, v0, top), P(tb, v1, top), P(ta, v1, top), [0, -1, 0], ceil.s, ceil.c);
  face(wall.q, P(ta, v1, y), P(tb, v1, y), P(tb, v1, top), P(ta, v1, top), outN, wall.s, wall.c);   // the back wall faces out of the building: back towards the street
  face(wall.q, P(ta, v0, y), P(ta, v1, y), P(ta, v1, top), P(ta, v0, top), tN, wall.s, wall.c);
  face(wall.q, P(tb, v1, y), P(tb, v0, y), P(tb, v0, top), P(tb, v1, top), mtN, wall.s, wall.c);
  // the street wall from inside: cut into columns at every hole's sides, each column whole or round its hole
  const holes = plan.holes.slice().sort((a, b) => a.t0 - b.t0), cuts = [ta];
  for (const o of holes) cuts.push(o.t0, o.t1); cuts.push(tb);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], c = cuts[i + 1]; if (c - a < 1e-4) continue;
    const o = holes.find(o => o.t0 <= a + 1e-6 && o.t1 >= c - 1e-6);
    const piece = (y0, y1) => { if (y1 - y0 > 1e-4) face(wall.q, P(a, v0, y0), P(c, v0, y0), P(c, v0, y1), P(a, v0, y1), inN, wall.s, wall.c); };
    if (!o) piece(y, top); else { piece(y, o.y0); piece(o.y1, top); }
  }
  // each hole's reveal, through the wall's thickness, and a sill under each window
  for (const o of holes) {
    face(wall.q, P(o.t0, 0, o.y0), P(o.t0, v0, o.y0), P(o.t0, v0, o.y1), P(o.t0, 0, o.y1), tN, wall.s, wall.c);
    face(wall.q, P(o.t1, 0, o.y0), P(o.t1, v0, o.y0), P(o.t1, v0, o.y1), P(o.t1, 0, o.y1), mtN, wall.s, wall.c);
    face(wall.q, P(o.t0, 0, o.y1), P(o.t1, 0, o.y1), P(o.t1, v0, o.y1), P(o.t0, v0, o.y1), [0, -1, 0], wall.s, wall.c);
    if (!o.door) face(trim.q, P(o.t0 - .05, 0, o.y0), P(o.t1 + .05, 0, o.y0), P(o.t1 + .05, v0 + .06, o.y0), P(o.t0 - .05, v0 + .06, o.y0), [0, 1, 0], 1, trim.c);
  }
  // a skirting board round the floor
  for (const [a, c, vv, n] of [[ta, tb, v1 - .02, outN], [ta, tb, v0 + .02, inN]]) { const cut = n === inN ? plan.holes.filter(o => o.y0 <= y + .2) : []; let s = a; for (const o of [...cut.sort((p, q) => p.t0 - q.t0), { t0: c, t1: c }]) { if (o.t0 > s) face(trim.q, P(s, vv, y), P(o.t0, vv, y), P(o.t0, vv, y + .1), P(s, vv, y + .1), n, 1, trim.c); s = Math.max(s, o.t1); } }
  face(trim.q, P(ta + .02, v0, y), P(ta + .02, v1, y), P(ta + .02, v1, y + .1), P(ta + .02, v0, y + .1), tN, 1, trim.c);
  face(trim.q, P(tb - .02, v1, y), P(tb - .02, v0, y), P(tb - .02, v0, y + .1), P(tb - .02, v1, y + .1), mtN, 1, trim.c);
}

function furniture(plan, Q) {
  for (const p of plan.pieces) {
    const B = Q(p.m, p.col, UVM[p.m] || 1), col = B.c;
    if (p.box) { const [x0, y0, z0, x1, y1, z1] = p.box; B.q.box(x0, y0, z0, x1, y1, z1, col, B.s); if (p.m === 'glow') B.q.under(x0, z0, x1, z1, y0 - .002, col); continue; }
    const [x, z, r, y0, y1, n] = p.prism;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, A = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], Bp = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r], am = (a0 + a1) / 2;
      const nn = [Math.cos(am), 0, Math.sin(am)];
      face(B.q, A, Bp, [Bp[0], y1, Bp[2]], [A[0], y1, A[2]], nn, B.s, col);
      B.q.tri([x, y1, z], [Bp[0], y1, Bp[2]], [A[0], y1, A[2]], [.5, .5, 1, 0, 0, 0], col);
    }
  }
}

/* ---------- the kit ---------- */

const ids = new WeakMap(); let nextId = 1;
const idOf = c => { if (!ids.has(c)) ids.set(c, nextId++); return ids.get(c); };

export class Interiors {
  /**
   * city: a gs.city City or Metro. world: a gs.physics3d World3D for the rooms' bodies (the one the game made, if left
   * out; false for none). reach: how near a door the player comes before the room behind it is made (metres). kinds:
   * which room is behind a door, b => a INSIDE_KINDS name, or null for a door that stays shut (default roomKind). auto: the
   * doors open by themselves as the player comes to them once the room is made (false: the game opens them, city.door(b, 1)).
   * budget: milliseconds a frame for making a room.
   */
  constructor(city, { world = null, reach = 22, kinds = null, auto = true, budget = 2, seed = 0, link = true } = {}) {
    this.city = city; this.view = city.view; this.reach = reach; this.kindOf = kinds || roomKind; this.auto = auto; this.seed = seed;
    world = linked(world, linksFor(this.view, link), 'world');
    this.world = world || null;
    this.regions = new Regions(this.view, { world: world || false, budget, keep: 2, link: false });
    this.rooms = new Map();   // part name -> room
    this.room = null; this.entered = false; this.left = false; this.t = 0;
    // every material a room can use, made now (under the loading screen), and drawn hidden once so its shader is built before play
    this.mats = new Map(); this.warm = new Group(); this.warm.name = 'interior shaders';
    for (const n of ['tiles', 'planks', 'marble', 'concrete', 'wood', 'stone', 'metal', 'fabric', 'paint', 'brick', 'plain', 'glow']) {
      const m = this.mat(n), w = new Mesh(boxGeo(), m); w.visible = false; w.frustumCulled = false; w.castShadow = w.receiveShadow = true; this.warm.add(w);
    }
    this.view.scene.add(this.warm);
  }
  // a room's material of a kind: one each, made in make() (the pieces' tints are their corners' colours, so a room made in play makes no material)
  mat(name) {
    let m = this.mats.get(name); if (m) return m;
    if (name === 'plain') m = new MeshStandardMaterial({ color: '#ffffff', roughness: .7, metalness: 0 });
    else if (name === 'glow') m = new MeshStandardMaterial({ color: '#ffffff', emissive: new Color('#fff4e0'), emissiveIntensity: 2.2, roughness: .5 });
    else if (name === 'paint') m = new MeshStandardMaterial({ color: '#ffffff', roughness: .9, metalness: 0 });   // (walls and ceilings: plain painted plaster)
    else {
      // (closeUp: false: the baked look only; a room's things are seen from a pace or two, and its pieces are tinted by their corners' colours)
      m = material(name, { closeUp: false, ...(name === 'brick' ? { colour: '#c09080' } : name === 'fabric' ? { colour: '#ffffff' } : {}) });
      if (name === 'tiles' || name === 'planks') m.roughness = 2.5;   // (a floor that has been walked on: less of a mirror to the ceiling lights)
      if (name === 'metal') { m.metalness = .6; m.roughness = .45; }
    }
    m.vertexColors = true; m.envMapIntensity = .45;   // (indoors: less of the sky in its shine)
    this.mats.set(name, m); return m;
  }
  /** The nearest front door to p within r: { building, door, city, room (once made, else null), ready }, or null. */
  near(p, r = 6) {
    const x = p.x, z = p.z ?? p.y; let best = null, bd = r;
    for (const c of this.cities()) for (const b of c.near(x, z, r + 10)) {
      const h = b.doorway; if (!h) continue; const d = Math.hypot(h.x - x, h.z - z);
      if (d < bd && this.kindOf(b)) { bd = d; best = { building: b, door: h, city: c }; }
    }
    if (!best) return null;
    const room = this.rooms.get(this.nameOf(best.city, best.building)) || null;
    return { ...best, room, ready: !!room };
  }
  /** The room p is in (made rooms only), or null. */
  at(p) { const x = p.x, z = p.z ?? p.y; for (const r of this.rooms.values()) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r; return null; }
  cities() { const c = this.city; return c.cities ? c.cities : [c]; }
  nameOf(city, b) { return 'room ' + idOf(city) + ':' + b.id; }
  // the room's part: its plan, then its shell, its furniture and its bodies, a piece a frame
  part(city, b) {
    const name = this.nameOf(city, b);
    if (this.regions.parts.has(name)) return name;
    const me = this;
    this.regions.part(name, function* (r) {
      const plan = roomPlan(b, { kind: me.kindOf(b), seed: me.seed }); yield;
      // (one mesh a material: what a piece is tinted is its corners' colour)
      const buckets = new Map(), Q = (n, col, s) => { let q = buckets.get(n); if (!q) buckets.set(n, q = new Quads()); return { q, s: s || 1, c: col ? new Color(col) : WHITE }; };
      shell(plan, b.doorway, Q); yield;
      furniture(plan, Q); yield;
      const g = new Group(); g.name = name;
      for (const [n, q] of buckets) if (!q.empty) { const m = new Mesh(q.geometry(), me.mat(n)); m.castShadow = n !== 'glow'; m.receiveShadow = true; m.userData.noOcclude = true; g.add(m); }   // (it stands inside its building's own box, which the view takes as solid: hd3d occluders)
      r.add(g); yield;
      if (me.world?.shapes) {
        const list = plan.boxes.map(q => ({ box: [q.x1 - q.x0, q.y1 - q.y0, q.z1 - q.z0], at: { x: (q.x0 + q.x1) / 2, y: (q.y0 + q.y1) / 2, z: (q.z0 + q.z1) / 2 } }));
        r.keep(me.world.shapes(list, { tag: 'room', sound: 'wood' }));
      }
      const room = { ...plan, name, city, building: b, door: b.doorway, live: true, shut: true, group: g, inside: p => { const x = p.x, z = p.z ?? p.y; return x >= room.x0 && x <= room.x1 && z >= room.z0 && z <= room.z1; }, free: (x, z, rr) => roomFree(room, x, z, rr) };
      b.room = room; me.rooms.set(name, room);
      r.on(() => { if (b.room === room) b.room = null; room.live = false; me.rooms.delete(name); city.door(b, 0); if (me.room === room) { me.room = null; me.left = true; } });
    });
    return name;
  }
  /** Once a frame, after the city's update: makes the room behind the nearest door, opens and shuts the doors, says where the player is. */
  update(dt, player) {
    const p = { x: player.x, z: player.z ?? player.y }; this.t += dt; this.entered = this.left = false;
    // the room the player is in stays wanted, and the one behind the nearest door
    const want = [], was = this.room;
    if (was) want.push(was.name);
    const n = this.near(p, this.reach);
    if (n) { const name = this.part(n.city, n.building); if (!want.includes(name)) want.push(name); }
    this.regions.want(want); this.regions.update(dt, { x: p.x, y: 0, z: p.z });
    // the doors: open as the player comes to a made room's door (from either side), shut once they have gone
    for (const r of this.rooms.values()) {
      const h = r.door, d = Math.hypot(h.x - p.x, h.z - p.z), inArea = p.x >= r.area.x0 && p.x <= r.area.x1 && p.z >= r.area.z0 && p.z <= r.area.z1;
      if (this.auto) { const k = r.city.doors?.open(r.building) ?? 0; if (d < 2.6 || (d < 3.6 && k > .5)) r.city.door(r.building, 1); else if (k > 0 && !(inArea && d < 1.4)) r.city.door(r.building, 0); }
      r.shut = (r.city.doors?.open(r.building) ?? 0) < .5;
    }
    // where the player is, and the room's lamps for the city's lights while they are near it
    const now = this.at(p);
    if (now !== was) { this.room = now; if (now) this.entered = true; if (was) this.left = true; }
    const lit = []; for (const r of this.rooms.values()) if (Math.hypot(r.door.x - p.x, r.door.z - p.z) < 30) for (const l of r.lamps) lit.push(l);
    this.city.indoor = lit;
    return this;
  }
  dispose() {
    for (const r of this.rooms.values()) r.city.door(r.building, 0);
    this.regions.dispose?.(); this.city.indoor = null; this.warm.removeFromParent();
    this.rooms.clear(); this.room = null;
  }
}
// (a tiny box: what the shaders are built on before play)
const WHITE = new Color('#ffffff'), boxGeo = () => { const q = new Quads(); q.box(0, 0, 0, .01, .01, .01, WHITE); return q.geometry(); };
