// gs.city doors: every building's own front door, hung in the doorway its street wall leaves open
// (doorwayOf in city.js), as two sets of copies for the whole city (one draw for the wooden ones,
// one for the glass ones of the shops and offices). Shut, a door fills its hole as a door should;
// a game (or gs.city Interiors, which makes the room behind) swings one open with city.door(b, 1).
// The door turns on its hinge into the building; a solid door (city.solid) is taken out of the way
// once it is open and put back when it shuts.
// Kit use only: city.js makes it.
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Matrix4, Quaternion, Vector3, Color, DynamicDrawUsage } from 'three';

// how deep a doorway's sides are (the wall's thickness: a room behind starts here) and where the door hangs in it
export const DOOR_DEEP = .3, DOOR_HANG = .12;

const LEAF = () => new BoxGeometry(1, 1, .05).translate(.5, .5, 0);   // (its hinge at x 0, its foot at y 0)
const WOOD = ['#5a3a24', '#2f3c4a', '#6e2a24', '#2e4a36', '#3a3632', '#e8e4dc', '#7a5a3a', '#1f2a36'];
const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _up = new Vector3(0, 1, 0);

export class Doors {
  /** buildings: the city's (each with its doorway); group: where the doors hang. */
  constructor(group, buildings) {
    const list = buildings.filter(b => b.doorway);
    this.wood = list.filter(b => !b.doorway.glass); this.glass = list.filter(b => b.doorway.glass);
    this.state = new Map();   // b.id -> { k (how open, 0..1), want, mesh, i }
    this.moving = new Set();
    const woodMat = new MeshStandardMaterial({ color: '#ffffff', roughness: .62, metalness: 0 });
    const glassMat = new MeshStandardMaterial({ color: '#3a4a54', roughness: .06, metalness: .35 });
    this.meshes = [];
    for (const [set, mat] of [[this.wood, woodMat], [this.glass, glassMat]]) {
      if (!set.length) continue;
      const m = new InstancedMesh(LEAF(), mat, set.length); m.name = 'city doors'; m.castShadow = m.receiveShadow = true;
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      set.forEach((b, i) => {
        this.state.set(b.id, { k: 0, want: 0, mesh: m, i, b });
        if (mat === woodMat) m.setColorAt(i, new Color(b.colour ? WOOD[b.id % 4] : WOOD[(b.id * 7) % WOOD.length]));
        this.place(m, i, b, 0);
      });
      m.computeBoundingSphere(); group.add(m); this.meshes.push(m);
    }
  }
  // a door's copy where it hangs, k of the way open (into the building, on its hinge)
  place(m, i, b, k) {
    const h = b.doorway, hx = h.ax + h.tx * h.t0 - h.nx * DOOR_HANG, hz = h.az + h.tz * h.t0 - h.nz * DOOR_HANG;
    _q.setFromAxisAngle(_up, Math.atan2(-h.tz, h.tx) + k * 1.45);
    m.setMatrixAt(i, _m.compose(_p.set(hx, h.y, hz), _q, _s.set(h.w - .02, h.h - .02, 1)));
    m.instanceMatrix.needsUpdate = true;
  }
  /** How far open b's door is to go (0 shut, 1 open); it swings there over the next frames. */
  set(b, want) { const s = this.state.get(b.id ?? b); if (!s) return this; s.want = Math.max(0, Math.min(1, want)); if (s.want !== s.k) this.moving.add(s); return this; }
  /** How far open b's door is now (0..1). */
  open(b) { return this.state.get(b.id ?? b)?.k ?? 0; }
  update(dt) {
    for (const s of this.moving) {
      const d = s.want - s.k, step = dt * (d > 0 ? 2.2 : 1.6);
      s.k = Math.abs(d) <= step ? s.want : s.k + Math.sign(d) * step;
      this.place(s.mesh, s.i, s.b, s.k * s.k * (3 - 2 * s.k));
      if (s.k === s.want) this.moving.delete(s);
    }
  }
  dispose() { for (const m of this.meshes) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); m.dispose?.(); } this.meshes = []; }
}
