// A person's body as solid rods with round ends (the trunk, the seat, the thighs, the shins, the upper arms and the forearms, sized to a
// clothed body), so what is posed by hand, not by the physics, keeps out of what is solid: gs.characters.Solid.
//
//   solid = new Solid(person);                        // a gs.models.human, a gs.poses person or figure (bones named hips, spine, legL...)
//   solid.keepOut();                                  // after rig.update(): an acted fall, a key pose or a lean that went into a wall is put
//                                                     // back out of it (the person moves; returns how far, or null if it was clear)
//   solid.room(dir, 1.8);                             // metres clear that way for a body to go down in (pick the fall with room)
//   solid.keepOff(rifle, { pivot: grip });            // a held thing turned about its grip until it is out of the body (and out of walls)
//
// What is solid is the game's gs.physics3d World3D (found by itself, as the kits find it: links.js) and whatever is in it that never
// moves: walls, buildings made solid, crates, the level, the ground. Its moving bodies are the physics' own to push. The cloth kit goes
// round the same rods (BODY), so clothes lie on the body that this keeps out of walls.
import { Vector3, Quaternion, Box3 } from 'three';
import { linksFor, linked, linksOf } from './links.js';

// [bone, a place on it, bone, a place on it, radius there, radius at the other end] (places in metres from the bone as the body stands; the radii
// a clothed body's): the trunk as two side by side (it is wider than it is deep), the thighs, the seat across the tops of the legs, the shins,
// the upper arms and the forearms. `part` names each for skip lists.
export const BODY = [
  ['hips', [.07, .06, -.01], 'spine', [.075, .28, -.015], .11, .11], ['hips', [-.07, .06, -.01], 'spine', [-.075, .28, -.015], .11, .11],
  ['legL', [0, -.04, 0], 'shinL', [0, .03, 0], .117, .078], ['legR', [0, -.04, 0], 'shinR', [0, .03, 0], .117, .078], ['legL', [-.01, .0, -.005], 'legR', [.01, .0, -.005], .122, .122],
  ['shinL', [0, 0, 0], 'footL', [0, .03, 0], .074, .055], ['shinR', [0, 0, 0], 'footR', [0, .03, 0], .074, .055],
  ['armL', [0, -.02, 0], 'foreL', [0, 0, 0], .058, .046], ['armR', [0, -.02, 0], 'foreR', [0, 0, 0], .058, .046],
  ['foreL', [0, 0, 0], 'handL', [0, -.07, 0], .046, .036], ['foreR', [0, 0, 0], 'handR', [0, -.07, 0], .046, .036],
];
export const PARTS = ['trunk', 'trunk', 'thigh', 'thigh', 'seat', 'shin', 'shin', 'arm', 'arm', 'fore', 'fore'];
// (the head as a ball on the head bone: a fall into a wall shows the head going in first)
const HEAD = [[0, .1, .02], .11];

const _v = new Vector3(), _w = new Vector3(), _p = new Vector3(), _n = new Vector3(), _q = new Quaternion(), _q2 = new Quaternion(), _box = new Box3();

/** How far a point is from the rod a..b (arrays), and where along it (0..1) it is nearest. */
export function nearRod(x, y, z, a, b, out = { d: 0, t: 0 }) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], px = x - a[0], py = y - a[1], pz = z - a[2], bb = bx * bx + by * by + bz * bz;
  const t = bb > 1e-12 ? Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / bb)) : 0;
  out.t = t; out.d = Math.hypot(px - bx * t, py - by * t, pz - bz * t); return out;
}

export class Solid {
  /**
   * person: a gs.models.human, gs.poses person or figure (anything with bones hips, spine, legL, shinL, footL, armL, foreL, handL and the R
   * ones). world: the World3D whose still things it keeps out of (default: the game's own; false: none, only the body itself for keepOff).
   * pad: metres added to every rod (clothes bulkier than the kit's). head: false leaves the head out.
   */
  constructor(person, { world = null, link = true, pad = 0, head = true } = {}) {
    this.person = person; this.pad = pad; this.given = world; this.L = world === false ? null : linksFor(null, link); this.on = link;
    const B = person?.bones || person?.rig?.parts || {};
    this.rods = [];
    BODY.forEach(([a, oa, b, ob, r, rb], i) => { if (B[a] && B[b]) this.rods.push({ ba: B[a], oa: new Vector3(...oa), bb: B[b], ob: new Vector3(...ob), r0: r, rb0: rb, part: PARTS[i], a: [0, 0, 0], b: [0, 0, 0], r, rb }); });
    if (head && B.head) this.rods.push({ ba: B.head, oa: new Vector3(...HEAD[0]), bb: B.head, ob: new Vector3(...HEAD[0]), r0: HEAD[1], rb0: HEAD[1], part: 'head', a: [0, 0, 0], b: [0, 0, 0], r: HEAD[1], rb: HEAD[1] });
    this.was = null;   // (each rod's ends a frame ago, so a body that went through thin ground (a mesh, a grid of heights) is put back on its side)
    this.pushed = null; this._near = { d: 0, t: 0 };
  }
  /** The world it keeps out of: the one given, else the game's (found when first asked, as it may be made after the person). */
  get world() {
    if (this.given === false) return null;
    if (this.given) return this.given;
    return linked(null, this.L, 'world') || (this.on !== false ? linksOf(this.person)?.one('world') : null) || null;
  }
  /** The rods where the bones are now (keepOut, room and keepOff call it). */
  update() {
    const P = this.person; P.updateMatrixWorld?.(true); const sc = P.getWorldScale?.(_v).x ?? 1;
    for (const s of this.rods) {
      const a = _v.copy(s.oa).applyMatrix4(s.ba.matrixWorld); s.a[0] = a.x; s.a[1] = a.y; s.a[2] = a.z;
      const b = _v.copy(s.ob).applyMatrix4(s.bb.matrixWorld); s.b[0] = b.x; s.b[1] = b.y; s.b[2] = b.z;
      s.r = s.r0 * sc + this.pad; s.rb = s.rb0 * sc + this.pad;
    }
    return this;
  }
  // the box round every rod (and pad metres more)
  bounds(pad = 0) {
    const lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const s of this.rods) for (const e of [s.a, s.b]) { const r = Math.max(s.r, s.rb) + pad; lo.x = Math.min(lo.x, e[0] - r); lo.y = Math.min(lo.y, e[1] - r); lo.z = Math.min(lo.z, e[2] - r); hi.x = Math.max(hi.x, e[0] + r); hi.y = Math.max(hi.y, e[1] + r); hi.z = Math.max(hi.z, e[2] + r); }
    return { lo, hi };
  }
  /**
   * Puts the person back out of the world's still things: each rod is tried at its ends and middle, and the person moved the deepest way
   * out, a few times over (a body lying along a wall's foot comes away from it). up: whether it may be lifted (false: only along the
   * ground, for a game that keeps the height itself); most: metres it may move in one call; ground: false leaves the ground (meshes and
   * grids of heights) out, for a game that fits feet and falls to its own land. Call after rig.update(). Returns { x, y, z } (how far it
   * moved, in the world) or null if it was clear. Moves person.position (in its parent's space).
   */
  keepOut({ world = this.world, up = true, most = .6, ground = true, tries = 3 } = {}) {
    if (!world?.world || !this.rods.length) return null;
    this.update();
    const { lo, hi } = this.bounds(.05), shapes = world.around(lo, hi, .05).filter(s => (ground || !s.thin) && !s.c.parent()?.isDynamic?.());
    const keepWas = () => { this.was = this.rods.map(s => [s.a.slice(), s.b.slice()]); };
    if (!shapes.length) { keepWas(); return null; }
    let tx = 0, ty = 0, tz = 0;
    for (let n = 0; n < tries; n++) {
      let best = null;
      this.rods.forEach((s, i) => {
        const w = this.was?.[i];
        for (const t of [0, .5, 1]) {
          const x = s.a[0] + (s.b[0] - s.a[0]) * t + tx, y = s.a[1] + (s.b[1] - s.a[1]) * t + ty, z = s.a[2] + (s.b[2] - s.a[2]) * t + tz, r = s.r + (s.rb - s.r) * t;
          const from = w ? { x: w[0][0] + (w[1][0] - w[0][0]) * t, y: w[0][1] + (w[1][1] - w[0][1]) * t, z: w[0][2] + (w[1][2] - w[0][2]) * t } : null;
          const h = world.outOf({ x, y, z }, r, shapes, from); if (h && (!best || h.depth > best.h.depth)) best = { h, x, y, z };
        }
      });
      if (!best || best.h.depth < .004) break;
      let dx = best.h.x - best.x, dy = best.h.y - best.y, dz = best.h.z - best.z;
      if (dy < 0 || !up) dy = 0;   // (never pushed down into the ground; up: false keeps its height)
      if (Math.hypot(dx, dy, dz) < .002) break;
      tx += dx; ty += dy; tz += dz;
    }
    const l = Math.hypot(tx, ty, tz);
    if (l > most) { const k = most / l; tx *= k; ty *= k; tz *= k; }
    if (l < .002) { keepWas(); return null; }
    this.move(tx, ty, tz); keepWas();
    return this.pushed = { x: tx, y: ty, z: tz };
  }
  // the person moved by (dx, dy, dz) in the world, and its rods with it
  move(dx, dy, dz) {
    const P = this.person; _v.set(dx, dy, dz);
    if (P.parent) { P.parent.updateMatrixWorld?.(true); P.parent.getWorldQuaternion(_q).invert(); _v.applyQuaternion(_q); const s = P.parent.getWorldScale(_w).x || 1; _v.multiplyScalar(1 / s); }
    P.position.add(_v); P.updateMatrixWorld?.(true);
    for (const s of this.rods) { s.a[0] += dx; s.a[1] += dy; s.a[2] += dz; s.b[0] += dx; s.b[1] += dy; s.b[2] += dz; }
  }
  /**
   * Metres clear in direction dir ({ x, z } or [x, z] on the ground, or with y) from where the person stands, up to length: a ball the
   * size of a body swept low (a low wall, a kerb) and at the waist (a wall, a tree), from the hips, against the world's still things. For
   * picking which way a body goes down, a step back, a dive: the one with room.
   */
  room(dir, length = 1.8, { world = this.world, r = .16, heights = [.3, .75] } = {}) {
    if (!world?.world) return length;
    const P = this.person; P.updateMatrixWorld?.(true);
    const d = Array.isArray(dir) ? { x: dir[0], y: dir.length > 2 ? dir[1] : 0, z: dir.length > 2 ? dir[2] : dir[1] } : { x: dir.x, y: dir.y || 0, z: dir.z }, l = Math.hypot(d.x, d.y, d.z) || 1;
    const hips = this.person.bones?.hips || this.person.rig?.parts?.hips, at = hips ? hips.getWorldPosition(_p) : P.getWorldPosition(_p), foot = P.getWorldPosition(_w).y;
    let free = length;
    for (const hgt of heights) {
      const from = { x: at.x, y: foot + hgt, z: at.z }, hit = world.sweep({ ball: r }, from, { x: d.x / l * length, y: d.y / l * length, z: d.z / l * length }, { still: true, inside: false });
      if (hit) free = Math.min(free, hit.distance);
    }
    return free;
  }
  /**
   * Turns a held thing (a gun, a sword, a tool: an Object3D) about pivot (a world point, or { x, y, z } in the thing's own space with
   * local: true; default its own origin) as little as it takes to get it out of this body and, with a world, out of walls. from and to:
   * the line through it to test, in its own space (default: the long way through its shape, worked out once); r: how thick it is (default
   * from its shape). skip: parts of the body it may touch ('arm', 'fore' by default: the arms that hold it; add 'trunk' for a stock in the
   * shoulder); ahead: only the longer side of the pivot (a grip: the butt in the shoulder is meant to touch). Returns the turn made (radians).
   * Call after the thing is placed and before the hands are put on it.
   */
  keepOff(thing, { pivot = null, local = false, from = null, to = null, r = null, skip = ['arm', 'fore'], ahead = false, world = this.world, walls = true, most = 2, tries = 8 } = {}) {
    if (!thing) return 0;
    const line = from && to ? { a: new Vector3(from.x ?? from[0], from.y ?? from[1], from.z ?? from[2]), b: new Vector3(to.x ?? to[0], to.y ?? to[1], to.z ?? to[2]), r: r ?? .025 } : (thing.userData.gsLine ||= lineOf(thing));
    const R = r ?? line.r;
    this.update(); thing.updateMatrixWorld(true);
    if (Array.isArray(pivot)) pivot = { x: pivot[0], y: pivot[1], z: pivot[2] };
    const piv = pivot ? (local ? _p.set(pivot.x, pivot.y, pivot.z).applyMatrix4(thing.matrixWorld) : _p.set(pivot.x, pivot.y, pivot.z)) : thing.getWorldPosition(_p);
    const pv = piv.clone(), rods = this.rods.filter(s => !skip.includes(s.part)), near = this._near;
    let shapes = null; if (walls && world?.world) { _box.makeEmpty(); for (const e of [line.a, line.b]) _box.expandByPoint(_v.copy(e).applyMatrix4(thing.matrixWorld)); const lo = _box.min, hi = _box.max; shapes = world.around({ x: lo.x - R, y: lo.y - R, z: lo.z - R }, { x: hi.x + R, y: hi.y + R, z: hi.z + R }, .05).filter(s => !s.thin && !s.c.parent()?.isDynamic?.()); if (!shapes.length) shapes = null; }
    let turned = 0;
    for (let n = 0; n < tries; n++) {
      thing.updateMatrixWorld(true);
      const A = _v.copy(line.a).applyMatrix4(thing.matrixWorld).clone(), B = _w.copy(line.b).applyMatrix4(thing.matrixWorld).clone();
      const ab = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) || 1, t0 = ((pv.x - A.x) * (B.x - A.x) + (pv.y - A.y) * (B.y - A.y) + (pv.z - A.z) * (B.z - A.z)) / (ab * ab);
      // (every point of it that is in something, and how deep: the turn that best takes them all out at once, least squares (Gauss-Newton:
      // a point's going along its way out is the turn dotted with lever x way out), so a muzzle caught between a thigh and a shin goes out
      // to the side rather than from one into the other)
      const M = [1e-4, 0, 0, 0, 1e-4, 0, 0, 0, 1e-4], v = [0, 0, 0]; let deep = 0;
      const add = (x, y, z, nx, ny, nz, d) => {
        const lx = x - pv.x, ly = y - pv.y, lz = z - pv.z, J = [ly * nz - lz * ny, lz * nx - lx * nz, lx * ny - ly * nx];
        for (let r = 0; r < 3; r++) { v[r] += J[r] * d; for (let c = 0; c < 3; c++) M[r * 3 + c] += J[r] * J[c]; }
        deep = Math.max(deep, d);
      };
      // the part of it to keep out: beyond a hand's width of the pivot (by the pivot a turn hardly moves it: that is where the hand holds
      // it), and with ahead only the longer side (a stock behind the grip is meant to touch the shoulder)
      const far = t0 < .5 ? B : A, near0 = t0 < .5 ? A : B, s0 = ahead ? Math.min(1, Math.max(0, Math.abs(t0 - (t0 < .5 ? 0 : 1)) + .12 / ab)) : 0;
      const S0 = { x: near0.x + (far.x - near0.x) * s0, y: near0.y + (far.y - near0.y) * s0, z: near0.z + (far.z - near0.z) * s0 };
      for (const s of rods) {   // (the nearest points of it and each rod: the way out is across both, so a stick through both thighs goes round them)
        const c = segSeg(S0, far, s.a, s.b); const rr = s.r + (s.rb - s.r) * c.u + R; if (c.d >= rr) continue;
        let nx = c.px - c.qx, ny = c.py - c.qy, nz = c.pz - c.qz; const l = Math.hypot(nx, ny, nz);
        if (l > 1e-6) { nx /= l; ny /= l; nz /= l; } else { const ex = far.x - S0.x, ey = far.y - S0.y, ez = far.z - S0.z, fx = s.b[0] - s.a[0], fy = s.b[1] - s.a[1], fz = s.b[2] - s.a[2]; nx = ey * fz - ez * fy; ny = ez * fx - ex * fz; nz = ex * fy - ey * fx; const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m; }
        add(c.px, c.py, c.pz, nx, ny, nz, rr - c.d);
      }
      if (shapes) for (let k = 0; k <= 6; k++) {
        const t = k / 6, x = S0.x + (far.x - S0.x) * t, y = S0.y + (far.y - S0.y) * t, z = S0.z + (far.z - S0.z) * t, h = world.outOf({ x, y, z }, R, shapes);
        if (h && h.depth > .002) add(x, y, z, h.nx, h.ny, h.nz, h.depth);
      }
      if (deep < .003) break;
      const w = solve3(M, v), ang0 = Math.hypot(w[0], w[1], w[2]); if (!(ang0 > 1e-5)) break;
      const ang = Math.min(.6, ang0 * 1.05); _n.set(w[0] / ang0, w[1] / ang0, w[2] / ang0);
      if (turned + ang > most) break;
      this.turn(thing, pv, _n, ang); turned += ang;
    }
    return turned;
  }
  // turns thing about the world point pv, about the world axis ax, by ang
  turn(thing, pv, ax, ang) {
    _q.setFromAxisAngle(ax, ang);
    const par = thing.parent;
    if (par) { par.updateMatrixWorld(true); par.getWorldQuaternion(_q2); const inv = _q2.clone().invert(); _q.premultiply(inv).multiply(_q2); }   // (the turn in the parent's space)
    const lp = par ? par.worldToLocal(pv.clone()) : pv.clone();
    thing.position.sub(lp).applyQuaternion(_q).add(lp); thing.quaternion.premultiply(_q); thing.updateMatrixWorld(true);
  }
}

// the nearest points of the segments p0..p1 and q0..q1 (q as arrays): { px, py, pz on the first, qx, qy, qz on the second, u along the second, d }
function segSeg(p0, p1, q0, q1) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, ex = q1[0] - q0[0], ey = q1[1] - q0[1], ez = q1[2] - q0[2], rx = p0.x - q0[0], ry = p0.y - q0[1], rz = p0.z - q0[2];
  const a = dx * dx + dy * dy + dz * dz, e = ex * ex + ey * ey + ez * ez, f = ex * rx + ey * ry + ez * rz, c = dx * rx + dy * ry + dz * rz, b = dx * ex + dy * ey + dz * ez, den = a * e - b * b;
  let s = 0, t = 0;
  if (a < 1e-12 && e < 1e-12) { s = t = 0; } else if (a < 1e-12) { t = Math.max(0, Math.min(1, f / e)); } else if (e < 1e-12) { s = Math.max(0, Math.min(1, -c / a)); }
  else { s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0; t = (b * s + f) / e; if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); } }
  const px = p0.x + dx * s, py = p0.y + dy * s, pz = p0.z + dz * s, qx = q0[0] + ex * t, qy = q0[1] + ey * t, qz = q0[2] + ez * t;
  return { px, py, pz, qx, qy, qz, u: t, d: Math.hypot(px - qx, py - qy, pz - qz) };
}
// x with M x = v (M a 3 x 3, a row at a time)
function solve3(M, v) {
  const [a, b, c, d, e, f, g, h, i] = M, A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C; if (Math.abs(det) < 1e-12) return [0, 0, 0];
  const D = c * h - b * i, E = a * i - c * g, F = b * g - a * h, G = b * f - c * e, H = c * d - a * f, I = a * e - b * d;
  return [(A * v[0] + D * v[1] + G * v[2]) / det, (B * v[0] + E * v[1] + H * v[2]) / det, (C * v[0] + F * v[1] + I * v[2]) / det];
}
// the long way through a thing's shape, in its own space: { a, b, r } (r: half its second size, at most 4 cm)
function lineOf(thing) {
  thing.updateMatrixWorld(true);
  const box = new Box3(), inv = thing.matrixWorld.clone().invert(), m = new Box3();
  thing.traverse(o => { if (!o.isMesh || !o.geometry) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); m.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld.clone().premultiply(inv)); box.union(m); });
  if (box.isEmpty()) return { a: new Vector3(), b: new Vector3(), r: .02 };
  const c = box.getCenter(new Vector3()), s = box.getSize(new Vector3()), k = s.x >= s.y && s.x >= s.z ? 'x' : s.y >= s.z ? 'y' : 'z', o = ['x', 'y', 'z'].filter(q => q !== k).map(q => s[q]).sort((p, q) => q - p);
  const a = c.clone(), b = c.clone(); a[k] = box.min[k]; b[k] = box.max[k];
  return { a, b, r: Math.min(.04, o[0] / 2) };
}
