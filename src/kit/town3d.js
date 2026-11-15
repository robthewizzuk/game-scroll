// gs.city.Town: a gs.town plan built in a Next Gen view. Its buildings (gs.models.building: cottages, timber-framed
// houses and the inn, a stone hall, a keep), a castle's walls, towers and gate (gs.models.fort), the square's well and
// market stalls, a smithy's anvil, torches by the doors, roads and fields, made solid in the game's World3D (found by
// itself, links.js). By night the windows glow and the torches light the streets round the camera, following the
// game's Clock or Sky (both found by themselves). The plan is the town's rules (gs.town Folk, Shop, Night read it);
// this only builds and lights it.
//
//   make() { town = new gs.city.Town(view, { seed: 7, kind: 'castle', houses: 16 }); clock = new gs.town.Clock(); }
//   update(dt) { clock.update(dt); town.update(dt); }      // town.plan for the folk, a map or a quest marker
//
// Kit use only through gs.city.

import { Group, Mesh, BufferGeometry, BufferAttribute, CircleGeometry, PlaneGeometry, Color } from 'three';
import { plan as townPlan } from './town.js';
import { building } from './models/buildings.js';
import { fort } from './models/castle.js';
import { prop } from './models/props.js';
import { material } from './models/materials.js';
import { pbr } from './hd3d.js';
import { linksFor, linked } from './links.js';

const flat = () => 0;
const DARK_GLASS = new Color('#141c24'), WARM = new Color('#ffcf8a');

/**
 * Builds a town. plan (a gs.town.plan, or its options: seed, kind 'village' | 'castle', houses, name), ground ((x, z)
 * => height, 0), world (a gs.physics3d World3D: found by itself; false: not solid), floor (true: a field of grass under
 * the town and its roads; false: your own land), clock / sky (found by themselves: windows and torches follow the dark;
 * or set town.dark 0..1 yourself), lamps (true: the torches light the streets near the camera at night, through the
 * view's lamp pool), materials ({ road, square, field, grass }: your own). Gives plan, group (in the scene), buildings
 * ([{ ...the plan's building, mesh }]), walls (fort pieces), gate (the gatehouse's portcullis Group: lift it by its
 * userData.lift to open), solid (the World3D body), dark. update(dt) each frame. drawMap(c, x, y, w, h, { at, range,
 * turn }) draws a small map. remove() takes it all out again.
 */
export class Town {
  constructor(view, { plan, ground = flat, world, floor = true, clock, sky, lamps = true, materials = {}, link, ...o } = {}) {
    this.view = view; this.plan = plan && plan.buildings ? plan : townPlan({ ...o, ...(plan || {}) }); this.ground = ground; this.lampsOn = lamps;
    this.links = linksFor(view, link); this.links?.join('town', this); this.givenClock = clock; this.givenSky = sky;
    this.givenWorld = world; this.dark = 0; this.t = 0;
    const P = this.plan, g = this.group = new Group(); g.name = 'gs-town'; view.scene.add(g);
    const castle = P.kind === 'castle';
    // windows that glow at night: one material for the whole town, its glow set each frame (no new shaders)
    this.glass = pbr('#141c24', { rough: .12, metal: .2, glow: 0, glowCol: '#ffc070' });
    this.glass.emissive?.set('#ffb860'); this.glass.emissiveIntensity = 0;
    const M = {
      road: materials.road || material(castle ? 'cobbles' : 'dirt', castle ? { colour: '#8a8378', dark: '#4e4a44' } : { colour: '#7a6044', dark: '#4a3a28', repeat: [1, 1] }),
      square: materials.square || material('cobbles', { colour: '#8e877a', dark: '#55504a' }),
      field: materials.field || material('dirt', { colour: '#5e4a30', dark: '#3a2c1c' }),
      grass: materials.grass || material('dirt', { colour: '#5d6a38', dark: '#3c4724' }),
    };
    this.mats = M;
    if (floor) {
      const S = (P.radius + 70) * 2, pl = new PlaneGeometry(S, S, 1, 1); pl.rotateX(-Math.PI / 2); uvMetres(pl, 4);
      const m = new Mesh(pl, M.grass); m.receiveShadow = true; m.name = 'grass'; m.position.y = ground(0, 0) - .02; g.add(m);
    }
    // roads: ribbons along their points, a little over the ground; the square a disc of cobbles
    for (const rd of P.roads) { const m = new Mesh(ribbon(rd.points, rd.width, ground, rd.kind === 'main' ? .03 : .025), M.road); m.receiveShadow = true; m.name = 'road'; g.add(m); }
    { const c = new CircleGeometry(P.square.r + 1.2, 40); c.rotateX(-Math.PI / 2); uvMetres(c, 1.4); const m = new Mesh(c, M.square); m.position.set(P.square.x, ground(P.square.x, P.square.z) + .04, P.square.z); m.receiveShadow = true; m.name = 'square'; g.add(m); }
    for (const f of P.fields) {
      const pl = new PlaneGeometry(f.w, f.d, 1, 1); pl.rotateX(-Math.PI / 2); uvMetres(pl, 3);
      const m = new Mesh(pl, M.field); m.position.set(f.x, ground(f.x, f.z) + .015, f.z); m.rotation.y = f.turn; m.receiveShadow = true; m.name = 'field'; g.add(m);
      for (let i = 0; i < 3; i++) { const h = prop('hay', { seed: i }); h.position.set(f.x + Math.sin(f.turn + i) * f.w * .3, ground(f.x, f.z), f.z + Math.cos(f.turn + i * 2) * f.d * .3); h.rotation.y = f.turn + i; g.add(h); }
    }
    // the buildings, sat on the lowest corner of their plot
    const solid = []; this.buildings = [];
    for (const b of P.buildings) {
      const y = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ground(b.x + sx * b.w / 2, b.z + sz * b.d / 2)));
      const mesh = building({ style: b.style, w: b.w, d: b.d, floors: b.floors, seed: P.seed * 31 + b.id, lit: .5, materials: { lit: this.glass } });
      mesh.position.set(b.x, y, b.z); mesh.rotation.y = b.turn; mesh.userData.townBuilding = b.id; g.add(mesh);
      this.buildings.push({ ...b, mesh, y });
      const H = b.floors * ({ keep: 4, stone: 3.4, timberframe: 2.7, cottage: 2.5 }[b.style] || 3);
      solid.push({ box: [b.w, H, b.d], at: { x: b.x, y: y + H / 2, z: b.z }, turn: b.turn, part: 'building:' + b.id });
    }
    // the walls, towers and gate of a castle town
    this.walls = []; this.gate = null;
    for (const w of P.walls) {
      const f = fort({ kind: w.kind, length: w.length, width: w.width, seed: P.seed, roof: w.kind === 'tower' && false });
      const y = ground(w.x, w.z); f.position.set(w.x, y, w.z); f.rotation.y = w.turn; g.add(f); this.walls.push(f);
      if (w.kind === 'gate') this.gate = f.getObjectByName('portcullis');
      const c = Math.cos(w.turn), s = Math.sin(w.turn);
      for (const q of f.userData.solid) solid.push({ box: q.size, at: { x: w.x + q.at[0] * c + q.at[2] * s, y: y + q.at[1], z: w.z - q.at[0] * s + q.at[2] * c }, turn: w.turn, part: w.kind });
    }
    // the square's well and stalls, the smithy's anvil and hay, the inn's sign, barrels by the shops
    this.props = [];
    for (const q of P.props) {
      const m = prop(q.kind, { seed: (q.stall ?? 0) + P.seed, colour: q.kind === 'stall' ? ['#a8342c', '#2c5a8a', '#3a7a3a', '#c8902a', '#7a3a7a'][(q.stall ?? 0) % 5] : undefined });
      m.position.set(q.x, (q.y ?? 0) + ground(q.x, q.z), q.z); m.rotation.y = q.turn; g.add(m); this.props.push(m);
      if (q.kind === 'well') solid.push({ ball: .85, at: { x: q.x, y: ground(q.x, q.z) + .4, z: q.z }, part: 'well' });
      if (q.kind === 'stall') solid.push({ box: [2.4, 1, 1.3], at: { x: q.x, y: ground(q.x, q.z) + .5, z: q.z }, turn: q.turn, part: 'stall' });
    }
    // torches by the doors (their flames glow at night: the prop's glowing part, dimmed by day)
    this.flames = [];
    for (const L of P.lights) {
      const t = prop('torch', { lit: 3 }); t.position.set(L.x, ground(L.x, L.z) + L.y, L.z); t.rotation.y = L.turn; g.add(t);
      const fl = t.getObjectByName('flame'); if (fl) { fl.visible = false; this.flames.push(fl); }
    }
    this.lampSpots = P.lights.map(L => ({ x: L.x + Math.sin(L.turn) * .35, y: ground(L.x, L.z) + L.y + .45, z: L.z + Math.cos(L.turn) * .35, col: '#ffb060', i: 0, flick: .35, reach: 9 }));
    this.solidList = solid; this.solid = null; this.solidWorld = null;
    this.makeSolid();
  }
  get clock() { return linked(this.givenClock, this.links, 'clock'); }
  get sky() { return linked(this.givenSky, this.links, 'sky'); }
  get world() { return linked(this.givenWorld, this.links, 'world'); }
  makeSolid() {
    const W = this.world; if (!W || W === this.solidWorld || !W.shapes) return;
    this.solid = W.shapes(this.solidList, { tag: 'town', sound: 'stone' }); this.solidWorld = W;
  }
  update(dt = 0) {
    this.t += dt;
    this.makeSolid();
    const C = this.clock, S = this.sky; if (C) this.dark = C.dark; else if (S) this.dark = S.night ?? 0;
    const k = this.dark;
    this.glass.emissiveIntensity = k * 2.2; this.glass.color.copy(DARK_GLASS).lerp(WARM, k * .25);
    for (const f of this.flames) f.visible = k > .15;
    const v = this.view;
    if (this.lampsOn && v.placeLamps && k > .15) {
      if (!v.lamps?.length) v.lampLights(12);
      const c = v.cam.position, near = this.lampSpots.filter(s => Math.abs(s.x - c.x) < 45 && Math.abs(s.z - c.z) < 45);
      for (const s of near) s.i = k * 6;
      v.placeLamps(near, c.x, c.y, c.z, this.t);
    } else if (this.wasLit && v.lamps?.length) for (const l of v.lamps) l.intensity = 0;
    this.wasLit = this.lampsOn && k > .15;
    return this;
  }
  /** Lifts the gatehouse's portcullis: open 0 (down) .. 1 (up). */
  open(k = 1) { if (this.gate) this.gate.position.y = this.gate.userData.lift * Math.max(0, Math.min(1, k)); return this; }
  /** The building at (x, z) or null. */
  buildingAt(x, z) {
    for (const b of this.buildings) { const c = Math.cos(b.turn), s = Math.sin(b.turn), lx = (x - b.x) * c - (z - b.z) * s, lz = (x - b.x) * s + (z - b.z) * c; if (Math.abs(lx) < b.w / 2 && Math.abs(lz) < b.d / 2) return b; }
    return null;
  }
  /** A small map: roads, the square, buildings (the inn, shops and keep picked out), walls, centred on at. */
  drawMap(c, x, y, w, h, { at = { x: 0, z: 0 }, range = 80, turn = 0, colours = {} } = {}) {
    const P = this.plan, K = { bg: '#3a4a2a', road: '#c8b894', house: '#8a6a50', inn: '#e0a040', shop: '#d0c060', keep: '#a0a0a8', wall: '#6a6a70', me: '#ffffff', ...colours };
    const s = Math.min(w, h) / (range * 2);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = K.bg; c.fillRect(x, y, w, h);
    c.translate(x + w / 2, y + h / 2); c.rotate(-turn); c.scale(s, s); c.translate(-at.x, -at.z);
    c.strokeStyle = K.road; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const rd of P.roads) { c.lineWidth = rd.width; c.beginPath(); rd.points.forEach(([px, pz], i) => i ? c.lineTo(px, pz) : c.moveTo(px, pz)); c.stroke(); }
    c.fillStyle = K.road; c.beginPath(); c.arc(P.square.x, P.square.z, P.square.r, 0, Math.PI * 2); c.fill();
    for (const b of P.buildings) {
      c.save(); c.translate(b.x, b.z); c.rotate(-b.turn); c.fillStyle = b.role === 'inn' ? K.inn : b.role === 'store' || b.role === 'bakery' || b.role === 'smithy' ? K.shop : b.role === 'keep' ? K.keep : K.house; c.fillRect(-b.w / 2, -b.d / 2, b.w, b.d); c.restore();
    }
    c.fillStyle = K.wall; for (const q of P.walls) { c.save(); c.translate(q.x, q.z); c.rotate(-q.turn); if (q.kind === 'tower') { c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill(); } else c.fillRect(-(q.length || 6) / 2, -1.3, q.length || 6, 2.6); c.restore(); }
    c.restore();
    c.fillStyle = K.me; c.beginPath(); c.arc(x + w / 2, y + h / 2, 3, 0, Math.PI * 2); c.fill();
  }
  remove() {
    this.group.removeFromParent();
    if (this.solid && this.solidWorld?.remove) this.solidWorld.remove(this.solid);
    this.links?.leave(this);
  }
}

// a strip along a polyline, width wide, its points on the ground, uv in metres
function ribbon(pts, width, ground, lift) {
  const n = pts.length, P = new Float32Array(n * 2 * 3), U = new Float32Array(n * 2 * 2), I = []; let along = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i], [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(n - 1, i + 1)], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
    if (i) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    for (let s = 0; s < 2; s++) {
      const k = s ? 1 : -1, px = x + nx * width / 2 * k, pz = z + nz * width / 2 * k, j = i * 2 + s;
      P.set([px, ground(px, pz) + lift, pz], j * 3); U.set([k * width / (lift > .028 ? 2.8 : 6) + .5, along / (lift > .028 ? 1.4 : 3)], j * 2);
    }
    if (i) { const a = (i - 1) * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(P, 3)); g.setAttribute('uv', new BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
  // (wound so its face looks up)
  const N = g.attributes.normal; if (N.getY(0) < 0) { for (let i = 0; i < I.length; i += 3) [I[i + 1], I[i + 2]] = [I[i + 2], I[i + 1]]; g.setIndex(I); g.computeVertexNormals(); }
  return g;
}
const uvMetres = (g, tile) => { const P = g.attributes.position, U = g.attributes.uv; for (let i = 0; i < P.count; i++) U.setXY(i, P.getX(i) / tile, P.getZ(i) / tile); U.needsUpdate = true; };
