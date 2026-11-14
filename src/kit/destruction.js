// Things that break: shatter any mesh into real pieces (Voronoi fracture from three-pinata) that fly
// apart with gs.physics3d, more pieces near where it was hit; slice a mesh along a plane; and keep
// the rubble tidy (pieces settle, fade and go so phones stay fast). Chain reactions of explosive
// barrels are gs.combat.Explosives.
//
//   const { shatter, slice, Rubble } = gs.destruction;
//   reset() { rubble = new Rubble(view.scene, { max: 60, life: 6 }); }
//   on a big hit: rubble.add(shatter(wall, { pieces: 14, at: hitPoint, world: phys, push: 6, inside: toon('#776655') }));
//   update(dt) { phys.step(dt); rubble.update(dt); }
//
// shatter() removes the mesh and puts the pieces in the scene where it was. Pieces keep its
// material outside and use `inside` on the broken faces. With a world, a mesh that had a body of its own
// there (a crate flying at a wall, a thrown vase) loses it and each piece carries on at the speed and spin
// that part of it had, so a thing breaks mid-flight and keeps going. Without a world they just appear in place
// (handy for a cut-scene or your own animation). Breaking is a little slow for big pieces counts:
// about 10-20 pieces is the sweet spot on phones; do it on the hit frame, not every frame.

import { Vector3 } from 'three';
import { DestructibleMesh, FractureOptions } from '@dgreenheck/three-pinata';

const v3 = p => (p ? new Vector3(p.x, p.y, p.z) : null);
// the body a mesh has in a World3D (made with world.box(mesh...) and the like), if any
const bodyOf = (world, mesh) => world && (mesh.body && !mesh.body.dead ? mesh.body : world.bodies?.find(b => b.mesh === mesh && !b.dead)) || null;
// how the old body moved, for its pieces: the speed of the point p (world) on it, v + w x r
function motion(old) {
  if (!old || old.fixed) return null;
  const v = old.vel, w = old.spin, c = old.pos;
  return { w, at: p => { const rx = p.x - c.x, ry = p.y - c.y, rz = p.z - c.z; return { x: v.x + w.y * rz - w.z * ry, y: v.y + w.z * rx - w.x * rz, z: v.z + w.x * ry - w.y * rx }; } };
}
// a piece made solid in the world: a hull, moving as that part of the old body did (null if it is too thin)
function solid(world, f, { density, was, tag = 'piece' }) {
  try {
    f.updateMatrixWorld(true);
    const b = world.hull(f, { density, tag });
    if (was) { const c = f.geometry.boundingSphere || (f.geometry.computeBoundingSphere(), f.geometry.boundingSphere); b.setVel(was.at(f.localToWorld(c.center.clone()))); b.setSpin(was.w); }
    return b;
  } catch (_) { return null; }   // (too thin for a hull: leave it as decoration)
}

/**
 * Breaks a mesh into pieces. pieces: how many; at: the world point it was hit (pieces are smaller
 * there); flat: true for walls and panes (2.5D fracture, faster); inside: material for broken faces;
 * world: a gs.physics3d World3D to make each piece a tumbling body; push: how hard pieces fly out from
 * `at` (metres a second); seed: the same seed breaks the same way. Returns the pieces (meshes, each
 * with .body when there's a world).
 */
export function shatter(mesh, { pieces = 12, at = null, flat = false, inside = null, world = null, push = 4, seed, density = 1, radius = null } = {}) {
  mesh.updateMatrixWorld(true);
  let root = mesh; while (root.parent) root = root.parent;   // pieces live in world space, in the scene
  const dm = new DestructibleMesh(mesh.geometry, mesh.material, inside || mesh.material);
  mesh.matrixWorld.decompose(dm.position, dm.quaternion, dm.scale); dm.updateMatrixWorld(true);
  const local = at ? mesh.worldToLocal(v3(at)) : null;
  const opts = new FractureOptions({
    fractureMethod: 'voronoi', fragmentCount: pieces, seed,
    voronoiOptions: { mode: flat ? '2.5D' : '3D', impactPoint: local || undefined, impactRadius: radius ?? undefined },
  });
  const frags = dm.fracture(opts);
  const out = [], old = bodyOf(world, mesh), was = motion(old);
  if (old) { old.mesh = null; old.remove(); }   // (its pieces take over from it)
  for (const f of frags) {
    f.castShadow = mesh.castShadow; f.receiveShadow = mesh.receiveShadow;
    if (f.scale.x !== 1 || f.scale.y !== 1 || f.scale.z !== 1) { f.geometry.scale(f.scale.x, f.scale.y, f.scale.z); f.scale.set(1, 1, 1); }   // bake scale so the physics shape matches
    if (root !== mesh) root.add(f);
    if (world && (f.body = solid(world, f, { density, was }))) {
      if (push && at) { const d = f.position.clone().sub(v3(at)); const l = d.length() || 1; d.multiplyScalar(push / l * (.6 + Math.random() * .6)); f.body.push(d.x, d.y + push * .3, d.z); f.body.twist((Math.random() - .5) * 6, (Math.random() - .5) * 6, (Math.random() - .5) * 6); }
    }
    out.push(f);
  }
  mesh.removeFromParent();
  return out;
}

/**
 * Cuts a mesh in two along a plane (world point and normal). Returns [top, bottom] meshes, added where it was.
 * world: a gs.physics3d World3D to make both halves bodies (a mesh that had a body there gives it up, and
 * the halves carry on as it moved: a sword through a thrown melon); apart: how hard they part along the
 * cut (metres a second); density as for shatter.
 */
export function slice(mesh, point, normal, { inside = null, world = null, apart = 0, density = 1 } = {}) {
  mesh.updateMatrixWorld(true);
  const dm = new DestructibleMesh(mesh.geometry, mesh.material, inside || mesh.material);
  let root = mesh; while (root.parent) root = root.parent;
  mesh.matrixWorld.decompose(dm.position, dm.quaternion, dm.scale); dm.updateMatrixWorld(true);
  const n = v3(normal).normalize(), parts = dm.sliceWorld(n, v3(point));
  const old = bodyOf(world, mesh), was = motion(old);
  if (old) { old.mesh = null; old.remove(); }
  parts.forEach((p, i) => {
    p.castShadow = mesh.castShadow; if (root !== mesh) root.add(p);
    if (p.scale.x !== 1 || p.scale.y !== 1 || p.scale.z !== 1) { p.geometry.scale(p.scale.x, p.scale.y, p.scale.z); p.scale.set(1, 1, 1); }
    if (world && (p.body = solid(world, p, { density, was, tag: 'half' })) && apart) { const k = i ? -apart / 2 : apart / 2; p.body.push(n.x * k, n.y * k, n.z * k); }
  });
  mesh.removeFromParent();
  return parts;
}

/**
 * Keeps broken pieces tidy: each lives `life` seconds, then shrinks away; past `max` the oldest go
 * first. Pieces with bodies are removed from physics too.
 */
export class Rubble {
  constructor(scene = null, { max = 60, life = 8, shrink = .6 } = {}) { this.scene = scene; this.max = max; this.life = life; this.shrink = shrink; this.list = []; }
  add(pieces) { for (const m of [].concat(pieces)) { m.userData.rubbleAge = 0; m.userData.rubbleScale = m.scale.x; this.list.push(m); } while (this.list.length > this.max) this.drop(this.list[0]); return this; }
  drop(m) { m.body?.remove(); m.removeFromParent(); m.geometry?.dispose(); this.list = this.list.filter(x => x !== m); }
  update(dt) {
    for (const m of [...this.list]) {
      const a = (m.userData.rubbleAge += dt), end = this.life;
      if (a > end) { const k = 1 - (a - end) / this.shrink; if (k <= 0) { this.drop(m); continue; } m.scale.setScalar(m.userData.rubbleScale * k); }
    }
    return this;
  }
  clear() { for (const m of [...this.list]) this.drop(m); return this; }
  get count() { return this.list.length; }
}
