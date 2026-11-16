// gs.outdoors.Ground: a yard, a street or a square to stand on, painted round the camera with nothing repeating
// (ground-paint.js, the ground gs.city lays): cast concrete slabs with tar in their joints, cracks (some sealed),
// pale stones in it, wear where traffic runs, oil and rust; or asphalt, paving, a plaza's flags, grass. On it the
// game lays painted lines, bays and hatched boxes (chipped, and worn where wheels run), lanes polished by traffic,
// oil, skid marks and scorches. In the rain (gs.sky.Weather) puddles gather with a soaked band and a damp halo
// round them, and water stays in the joints and cracks.
//
//   ground = new Ground(view, { size: 80, kind: 'yard' });                     // in make(): its mesh is in the scene
//   ground.lane(-30, 0, 30, 0, { width: 3.5 });                                 // where the trucks run
//   ground.line(-30, 2, 30, 2, { colour: 'yellow', width: .15 });               // a line along it
//   ground.bay(10, 8, 2.6, 5.5, { angle: 0 });  ground.hatch(-8, -8, 6, 3, { colour: 'yellow' });
//   ground.stamp(4, 3, 'oil', { size: 1.2 });
//   draw(c) { ground.update(); view.render(c, W, H); }                         // before the view draws
//
// Positions are the view's metres (x, z; y up). Next Gen views (WebGPU, and WebGL behind it). Kit use: games
// reach it as gs.outdoors.Ground.
import { Mesh, PlaneGeometry, RepeatWrapping, Vector2 } from 'three';
import { GroundPaint, PAINT_KINDS } from './ground-paint.js';
import { groundDetail } from './looks.js';
import { pbr } from './hd3d.js';
import { ORIGIN } from './origin.js';

const BASES = { yard: '#a6a299', asphalt: '#4a4a4c', paving: '#9a958c', plaza: '#a8a294', grass: '#5d7a3a' };

export class Ground {
  /**
   * view: an HDView. size: metres across (or [width, depth]); kind: 'yard' | 'asphalt' | 'paving' | 'plaza' | 'grass';
   * colour: its base colour; at: [x, z] of its middle; y: its height; bumps: how rough its face is up close (0..1, .3);
   * levels: [[metres, texels], [metres, texels]] of the two pictures painted round the camera (fine first).
   */
  constructor(view, { size = 60, kind = 'yard', colour, color, at = [0, 0], y = 0, bumps = .3, levels } = {}) {
    if (!(kind in PAINT_KINDS)) throw new Error(`gs.outdoors.Ground: no kind '${kind}' (try ${Object.keys(PAINT_KINDS).join(', ')})`);
    this.view = view; this.kind = kind;
    const [w, d] = Array.isArray(size) ? size : [size, size];
    const nrm = groundDetail().normal.clone(); nrm.wrapS = nrm.wrapT = RepeatWrapping; nrm.repeat.set(w / 3, d / 3); nrm.needsUpdate = true;
    const m = pbr(colour ?? color ?? BASES[kind], { rough: .85, normalMap: nrm, normalScale: new Vector2(bumps, bumps) });
    m.name = 'ground:' + kind;
    this.mesh = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
    this.mesh.position.set(at[0], y, at[1]); this.mesh.receiveShadow = true; this.mesh.name = 'ground';
    view.scene.add(this.mesh); this.mesh.updateMatrixWorld(true);
    this.paint = new GroundPaint(view, levels ? { levels } : undefined);
    this.paint.add(this.mesh, kind);
  }
  // the view's metres to the world's own (origin.js: a world that moves its centre keeps its marks where they were)
  wx(x) { return x + ORIGIN.x; }
  wz(z) { return z + ORIGIN.z; }
  /** More ground painted the same way: a kerb's top, a pavement (kind: as the constructor's; base: its colour, else its material's). */
  add(mesh, kind = this.kind, o = {}) { return this.paint.add(mesh, kind, o); }
  /**
   * A mark: 'oil' | 'skid' | 'scorch' | 'line' | 'lane' | 'hatch' at x, z (ground-paint.js stamp(): size, angle, strength,
   * track, width, colour, dash). Returns it, for unstamp().
   */
  stamp(x, z, kind = 'oil', o = {}) { return this.paint.stamp(this.wx(x), this.wz(z), kind, o); }
  unstamp(s) { this.paint.unstamp(s); }
  /** A painted line from (x0, z0) to (x1, z1): width (.12 m), colour ('white', 'yellow', 'red', 'blue', 'orange'... or any colour), dash (a dash's length, 0 solid), strength (1 fresh, lower worn). */
  line(x0, z0, x1, z1, o = {}) { return this.paint.line(this.wx(x0), this.wz(z0), this.wx(x1), this.wz(z1), o); }
  /** A lane worn by traffic from (x0, z0) to (x1, z1): polished and darker, with rubber in its two wheel tracks; lines in it wear through. width (3 m), strength. */
  lane(x0, z0, x1, z1, o = {}) { return this.paint.lane(this.wx(x0), this.wz(z0), this.wx(x1), this.wz(z1), o); }
  /** A hatched box w x d metres centred at x, z, turned by angle: a border and stripes spacing apart (colour, strength). */
  hatch(x, z, w, d, { angle = 0, spacing = .6, ...o } = {}) { return this.paint.stamp(this.wx(x), this.wz(z), 'hatch', { ...o, size: w, width: d, angle, dash: spacing }); }
  /**
   * A bay (a parking or storage space) w x d metres centred at x, z, turned by angle: painted lines round it, its front (+z
   * before turning) open unless open is false. width, colour, strength as line(). Returns its lines.
   */
  bay(x, z, w, d, { angle = 0, open = true, ...o } = {}) {
    const c = Math.cos(angle), s = Math.sin(angle), P = (u, v) => [x + u * c - v * s, z + u * s + v * c], hw = w / 2, hd = d / 2;
    const sides = [[[-hw, -hd], [-hw, hd]], [[hw, -hd], [hw, hd]], [[-hw, -hd], [hw, -hd]]]; if (!open) sides.push([[-hw, hd], [hw, hd]]);
    return sides.map(([a, b]) => { const [x0, z0] = P(...a), [x1, z1] = P(...b); return this.line(x0, z0, x1, z1, o); });
  }
  /** Each frame before the view draws (at: where the camera is; the view's camera by default). */
  update(at = this.view.cam.position) { this.paint.update(at); return this; }
  /** Still painting (strips waiting)? */
  get busy() { return this.paint.busy; }
  dispose() { this.paint.dispose(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
